import { describe, expect, it } from "vitest";

import { canInChannel, canOnServer, CHANNEL_PERMISSIONS } from "./permissions";
import type { ServerInfoDetails } from "./types";

function info(details: Partial<ServerInfoDetails>): ServerInfoDetails {
  return details as ServerInfoDetails;
}

describe("canOnServer", () => {
  it("offers everything to a server that sent no permissions", () => {
    expect(canOnServer(info({}), "send_direct_messages")).toBe(true);
    expect(canOnServer(undefined, "send_direct_messages")).toBe(true);
  });

  it("offers what the account was given", () => {
    expect(
      canOnServer(
        info({ permissions: ["send_messages", "send_direct_messages"] }),
        "send_direct_messages",
      ),
    ).toBe(true);
  });

  it("withholds what a server that knows the permission did not give", () => {
    expect(
      canOnServer(
        info({
          permissions: ["send_messages"],
          permission_catalogue: ["send_messages", "send_direct_messages"],
        }),
        "send_direct_messages",
      ),
    ).toBe(false);
  });

  it("offers a permission the server has never heard of", () => {
    // A server from before `send_direct_messages` existed: the permission is in neither
    // list, and reading that as a denial hides messaging where it works.
    expect(
      canOnServer(
        info({
          permissions: ["send_messages"],
          permission_catalogue: ["send_messages", "attach_files"],
        }),
        "send_direct_messages",
      ),
    ).toBe(true);
  });

  it("falls back to the frozen list when no catalogue was sent", () => {
    const older = info({ permissions: ["attach_files"] });
    // In the frozen list and not granted: a real denial.
    expect(canOnServer(older, "send_messages")).toBe(false);
    // Outside it, so that build cannot have been withholding it.
    expect(canOnServer(older, "send_direct_messages")).toBe(true);
  });
});

describe("canInChannel", () => {
  const serverWide = (held: string[]) => (permission: string) => held.includes(permission);
  const everything = serverWide([...CHANNEL_PERMISSIONS, "kick_members"]);
  const readOnly = serverWide(["read_messages"]);

  it("reads a deny from the channel's list", () => {
    const noReactions = {
      myPermissions: CHANNEL_PERMISSIONS.filter((p) => p !== "add_reactions" && p !== "attach_files"),
      canSend: true,
      canJoin: true,
    };
    expect(canInChannel(noReactions, everything, "add_reactions")).toBe(false);
    expect(canInChannel(noReactions, everything, "attach_files")).toBe(false);
    expect(canInChannel(noReactions, everything, "send_messages")).toBe(true);
  });

  it("lets a channel allow open what the role lacks server-wide", () => {
    const podium = { myPermissions: ["read_messages", "send_messages", "join_voice"], canSend: true, canJoin: true };
    expect(canInChannel(podium, readOnly, "send_messages")).toBe(true);
    expect(canInChannel(podium, readOnly, "join_voice")).toBe(true);
    expect(canInChannel(podium, everything, "kick_members")).toBe(true);
    expect(canInChannel(podium, readOnly, "kick_members")).toBe(false);
  });

  it("reads an empty list as holding nothing", () => {
    expect(canInChannel({ myPermissions: [] }, everything, "add_reactions")).toBe(false);
  });

  it("falls back to server-wide, narrowed by canSend and canJoin, on an older server", () => {
    const older = { canSend: false, canJoin: true };
    expect(canInChannel(older, everything, "send_messages")).toBe(false);
    expect(canInChannel(older, everything, "join_voice")).toBe(true);
    expect(canInChannel(older, everything, "add_reactions")).toBe(true);
    expect(canInChannel({ canSend: true }, readOnly, "send_messages")).toBe(false);
    expect(canInChannel({ canJoin: true }, readOnly, "join_voice")).toBe(false);
    expect(canInChannel({}, everything, "send_messages")).toBe(true);
    expect(canInChannel({}, readOnly, "add_reactions")).toBe(false);
  });

  it("gives a DM or an unknown channel the server-wide answer", () => {
    expect(canInChannel(undefined, everything, "add_reactions")).toBe(true);
    expect(canInChannel(undefined, readOnly, "add_reactions")).toBe(false);
  });
});
