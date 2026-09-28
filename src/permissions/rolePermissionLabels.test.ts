import { describe, expect, it } from "vitest";

import { humanizePermission } from "./rolePermissionLabels";

describe("humanizePermission", () => {
  it("title-cases every word, split on the underscores", () => {
    expect(humanizePermission("send_messages")).toBe("Send Messages");
  });

  it("handles a single-word permission", () => {
    expect(humanizePermission("mentionable")).toBe("Mentionable");
  });
});
