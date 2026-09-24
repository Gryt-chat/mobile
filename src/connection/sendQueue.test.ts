import { describe, expect, it } from "vitest";

import { ACK_TIMEOUT_MS, GIVE_UP_AFTER_MS, type QueueSocket, RESTORE_GRACE_MS, SendQueue } from "./sendQueue";

/* The cases the desktop client's scripts/check-send-queue.mjs runs, word for word,
 * since the two queues are meant to stay the same (GRYT-1453). */

const assert = {
  deepEqual: (actual: unknown, expected: unknown, message?: string) => expect(actual, message).toEqual(expected),
  equal: (actual: unknown, expected: unknown, message?: string) => expect(actual, message).toBe(expected),
};

/** A socket.io client as far as the queue can tell, with a clock the test turns. */
function harness({ connected = true } = {}) {
  const listeners = new Map<string, ((payload?: unknown) => void)[]>();
  const socket = {
    connected,
    on: (event: string, cb: (payload?: unknown) => void) => listeners.set(event, [...(listeners.get(event) ?? []), cb]),
    off: (event: string, cb: (payload?: unknown) => void) => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== cb)),
  };
  const fire = (event: string, payload?: unknown) => {
    for (const cb of listeners.get(event) ?? []) cb(payload);
  };

  let now = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  let nextId = 0;
  const clock = {
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++nextId;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => {
      timers = timers.filter((t) => t.id !== id);
    },
  };
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      await settle();
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      timers = timers.filter((t) => t !== due);
      due.fn();
    }
    now = end;
    await settle();
  };

  const sent: string[] = [];
  const gaveUp: string[] = [];
  const waiting = new Map<string, boolean>();
  const queue = new SendQueue(socket as unknown as QueueSocket, {
    emit: async (nonce: string) => {
      if (!socket.connected) return "offline" as const;
      sent.push(nonce);
      return "sent" as const;
    },
    onGiveUp: (nonce: string) => gaveUp.push(nonce),
    onWaiting: (nonce: string, on: boolean) => waiting.set(nonce, on),
    timers: clock,
  });

  const drop = () => {
    socket.connected = false;
    fire("disconnect");
  };
  const back = () => {
    socket.connected = true;
    fire("connect");
  };
  const restored = () => fire("server:details", { channels: [] });
  const echo = (nonce: string) => fire("chat:new", { message_id: `id-${nonce}`, nonce });
  return { queue, socket, fire, advance, settle, sent, gaveUp, waiting, drop, back, restored, echo };
}

describe("SendQueue", () => {
  it("waits while down and until restored, then sends once", async () => {
    const h = harness();
    h.drop();
    h.queue.add("down");
    await h.settle();
    assert.deepEqual(h.sent, [], "a send made while the server is down waits");
    assert.equal(h.waiting.get("down"), true, "and says so on its row");

    h.back();
    await h.advance(RESTORE_GRACE_MS - 1);
    assert.deepEqual(h.sent, [], "a socket that is back but not restored is not sent to");

    h.fire("server:details", { error: "join_required" });
    await h.settle();
    assert.deepEqual(h.sent, [], "details refused to an unidentified socket are not the restore");

    h.restored();
    await h.settle();
    assert.deepEqual(h.sent, ["down"], "it goes once the server knows who this is");
    assert.equal(h.waiting.get("down"), false);

    h.echo("down");
    await h.advance(ACK_TIMEOUT_MS * 3);
    assert.deepEqual(h.sent, ["down"], "confirmed, it goes no more");
    assert.deepEqual(h.gaveUp, []);
  });

  it("sends what was on the wire again after a drop", async () => {
    const h = harness();
    h.drop();
    h.queue.add("refreshed");
    h.back();
    h.fire("token:refreshed", { accessToken: "t" });
    await h.settle();
    assert.deepEqual(h.sent, ["refreshed"], "a token refresh names the socket too, and can beat the restore");
  });

  it("drains what built up one at a time, in order", async () => {
    const h = harness();
    h.drop();
    h.queue.add("silent");
    h.back();
    await h.advance(RESTORE_GRACE_MS);
    assert.deepEqual(h.sent, ["silent"], "a server that never says goes out after the grace, and the echo decides");
  });

  it("sends again when the echo is overdue, and fails at the cap", async () => {
    const h = harness();
    h.queue.add("in-flight");
    await h.settle();
    assert.deepEqual(h.sent, ["in-flight"]);
    h.drop();
    assert.equal(h.waiting.get("in-flight"), true, "a send on the wire when it dropped waits again");
    h.back();
    h.restored();
    await h.settle();
    assert.deepEqual(h.sent, ["in-flight", "in-flight"], "and goes again under the same nonce");
  });

  it("fails a send whose server never comes back", async () => {
    const h = harness();
    h.drop();
    for (const nonce of ["one", "two", "three"]) h.queue.add(nonce);
    h.back();
    h.restored();
    await h.settle();
    assert.deepEqual(h.sent, ["one"], "what built up goes one at a time, so it lands in order");
    h.queue.add("four");
    await h.settle();
    assert.deepEqual(h.sent, ["one"], "a send made during the flush queues behind it");
    h.echo("one");
    await h.settle();
    assert.deepEqual(h.sent, ["one", "two"]);
    await h.advance(ACK_TIMEOUT_MS);
    assert.deepEqual(h.sent, ["one", "two", "two", "three"], "an overdue echo sends it again and lets the next one go");
    h.echo("two");
    h.echo("three");
    await h.settle();
    assert.deepEqual(h.sent.slice(4), ["four"]);
    h.echo("four");
    h.queue.add("five");
    h.queue.add("six");
    await h.settle();
    assert.deepEqual(h.sent.slice(5), ["five", "six"], "once drained, sends go straight out again");
  });

  it("goes on a token refresh, which can beat the restore", async () => {
    const h = harness();
    h.queue.add("unanswered");
    await h.advance(ACK_TIMEOUT_MS);
    assert.deepEqual(h.sent, ["unanswered", "unanswered"], "no echo in time sends it again");
    await h.advance(GIVE_UP_AFTER_MS);
    assert.deepEqual(h.gaveUp, ["unanswered"], "and at the cap it fails");
    const count = h.sent.length;
    await h.advance(ACK_TIMEOUT_MS * 3);
    assert.equal(h.sent.length, count, "after which nothing goes");
  });

  it("goes after the grace when the server never says", async () => {
    const h = harness();
    h.drop();
    h.queue.add("never-back");
    await h.advance(GIVE_UP_AFTER_MS - 1);
    assert.deepEqual(h.gaveUp, []);
    await h.advance(1);
    assert.deepEqual(h.gaveUp, ["never-back"], "a server that never comes back fails the row at the cap");
  });

  it("waits for a refusal's retry instead of going on its own", async () => {
    const h = harness();
    h.queue.add("refused");
    await h.settle();
    h.queue.hold("refused");
    await h.advance(ACK_TIMEOUT_MS * 3);
    assert.deepEqual(h.sent, ["refused"], "a refused send waits for its retry instead of going on its own");
    h.queue.resend("refused");
    await h.settle();
    assert.deepEqual(h.sent, ["refused", "refused"]);
    h.queue.settle("refused");
    await h.advance(ACK_TIMEOUT_MS * 3);
    assert.equal(h.sent.length, 2, "settled, it goes no more");
  });

  it("fails what it still holds when it goes away", async () => {
    const h = harness();
    h.drop();
    h.queue.add("left-behind");
    h.queue.dispose();
    assert.deepEqual(h.gaveUp, ["left-behind"], "a queue going away fails what it still holds");
  });
});
