import { describe, expect, it } from "vitest";

import { maskEmail } from "./maskEmail";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("someone@example.com")).toBe("s•••••@example.com");
  });

  it("hides everything when there's no local part to keep", () => {
    expect(maskEmail("@example.com")).toBe("•••••");
    expect(maskEmail("nobody")).toBe("•••••");
  });
});
