import { describe, expect, it } from "vitest";

import { duplicateStreamIds } from "./transportDedupe";

const remote = { isLocal: false };
const local = { isLocal: true };

/* Streams carry no identity, so the mapping is the app's. "s-alice" is not a user id. */
const streams = { "s-alice": remote, "s-bob": remote, "s-mine": local };
const whoIs = (id: string) => ({ "s-alice": "alice", "s-bob": "bob", "s-mine": "me" })[id];

describe("duplicateStreamIds", () => {
  it("names nobody when this device is off the transport", () => {
    expect(duplicateStreamIds(streams, whoIs, undefined)).toEqual(new Set());
    expect(duplicateStreamIds(streams, whoIs, new Set())).toEqual(new Set());
  });

  it("names only the streams whose person is heard on the transport", () => {
    expect(duplicateStreamIds(streams, whoIs, new Set(["bob"]))).toEqual(new Set(["s-bob"]));
    expect(duplicateStreamIds(streams, whoIs, new Set(["alice", "bob"]))).toEqual(
      new Set(["s-alice", "s-bob"]),
    );
  });

  it("never names your own stream, however the set reads", () => {
    expect(duplicateStreamIds(streams, whoIs, new Set(["me"]))).toEqual(new Set());
  });

  it("skips a stream it cannot put a name to", () => {
    // A member list that has not caught up with a join yet: better heard twice than silent.
    expect(duplicateStreamIds(streams, () => undefined, new Set(["bob"]))).toEqual(new Set());
  });

  it("ignores a transport user with no stream of their own", () => {
    expect(duplicateStreamIds(streams, whoIs, new Set(["carol"]))).toEqual(new Set());
  });
});
