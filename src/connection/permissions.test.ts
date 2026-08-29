import { describe, expect, it } from "vitest";

import { canOnServer } from "./permissions";
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
    // A server from before `send_direct_messages` existed: it lists what this
    // account may do, and the permission is in neither list. Reading that as a
    // denial is what would hide messaging on a server where it works.
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
