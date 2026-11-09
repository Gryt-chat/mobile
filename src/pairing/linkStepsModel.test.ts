import { describe, expect, it } from "vitest";

import type { ApproverInFlight } from "./linkStepsModel";
import { approverSteps, newDeviceSteps } from "./linkStepsModel";

const device = { name: "MacBook", app: "Gryt desktop", platform: "macOS" };
const shape = (steps: { label: string; state: string }[]) => steps.map((s) => `${s.state}:${s.label}`);
const history = (messages: number, total: number | null) => ({ messages, total, complete: false }) as never;

describe("approver steps", () => {
  const at = (pairing: object) => pairing as ApproverInFlight;

  it("has a sign-in row only for an account, and the browser step counts as signing in", () => {
    expect(shape(approverSteps(at({ phase: "browser", device, url: "x" }), null, true))).toEqual([
      "done:Checked it's yours",
      "busy:Signing in your MacBook",
      "todo:Waiting for your MacBook to join your servers",
      "todo:Adding it to your chats",
    ]);
    expect(shape(approverSteps(at({ phase: "waiting_ready", device }), null, false))).toEqual([
      "done:Checked it's yours",
      "busy:Waiting for your MacBook to join your servers",
      "todo:Adding it to your chats",
    ]);
  });

  it("counts chats while adding, and adds the history row only when there is history", () => {
    const adding = approverSteps(at({ phase: "adding", device, host: "h", done: 3, total: 12 }), null, true);
    expect(adding.at(-1)).toEqual({ label: "Adding it to your chats", detail: "3 of 12", state: "busy" });
    const sending = approverSteps(at({ phase: "sending", device, added: {} }), history(5, 40), false);
    expect(shape(sending).slice(-2)).toEqual(["done:Adding it to your chats", "busy:Copying older messages"]);
    expect(sending.at(-1)?.detail).toMatch(/5 of 40/);
  });

  it("says nothing about a history of nothing", () => {
    const steps = approverSteps(at({ phase: "sending", device, added: {} }), history(0, 0), false);
    expect(steps.at(-1)?.detail).toBeUndefined();
  });
});

describe("new device steps", () => {
  it("signs in, then joins, then waits to be added, then gets the history", () => {
    const signing = newDeviceSteps({ phase: "signing_in", username: "sivert", from: "Pixel" } as never, null, null, true);
    expect(shape(signing).slice(0, 2)).toEqual(["done:Checked it's yours", "busy:Signing in as sivert"]);

    const joining = newDeviceSteps({ phase: "joining", servers: [], from: "Pixel" } as never, { done: 1, total: 3 }, null, true);
    expect(shape(joining)).toEqual([
      "done:Checked it's yours",
      "done:Signed in",
      "busy:Connecting to your servers",
      "todo:Getting added to your chats",
    ]);
    expect(joining[2].detail).toBe("1 of 3");

    const linked = newDeviceSteps({ phase: "linked", from: "Pixel" } as never, null, history(10, 100), true);
    expect(shape(linked).slice(-2)).toEqual(["done:Getting added to your chats", "busy:Getting older messages"]);
  });

  it("leaves the sign-in row out for a guest, and waits on the chats with no history", () => {
    const linked = newDeviceSteps({ phase: "linked", from: "Pixel" } as never, null, null, false);
    expect(shape(linked)).toEqual([
      "done:Checked it's yours",
      "done:Connecting to your servers",
      "busy:Getting added to your chats",
    ]);
    expect(linked[0].detail).toBe("The pictures matched on Pixel");
  });
});
