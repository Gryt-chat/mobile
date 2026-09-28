import { formatPairingQr } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { formatCodeInput, isCompleteCode, isPairingLink, judgeScan } from "./input";
import { approverEndText, deviceLine, locationLine, secondsLeft } from "./words";

const QR = formatPairingQr({ sessionId: new Uint8Array(16).fill(3), publicKey: new Uint8Array(32).fill(9) });

describe("what the scanner and the code field accept", () => {
  it("claims a link code and skips any other QR", () => {
    expect(judgeScan(QR)).toBe("claim");
    expect(judgeScan("https://gryt.chat")).toBe("ignore");
    expect(judgeScan("GRYT:1:short")).toBe("ignore");
    expect(judgeScan(QR.replace("GRYT:1:", "GRYT:2:"))).toBe("newer_version");
  });

  it("formats a typed code as it goes", () => {
    expect(formatCodeInput("7kqm")).toBe("7KQM");
    expect(formatCodeInput("7kqmx")).toBe("7KQM-X");
    expect(formatCodeInput("7kq m-x4 td!!zz")).toBe("7KQM-X4TD");
  });

  it("forgives O, I and L the way the relay does", () => {
    expect(isCompleteCode("7KQM-X4TD")).toBe(true);
    expect(isCompleteCode("oooo-iiii")).toBe(true);
    expect(isCompleteCode("7KQM-X4T")).toBe(false);
    expect(isCompleteCode("7KQM-X4TU")).toBe(false);
  });

  it("knows a link code opened from outside the app", () => {
    expect(isPairingLink(QR)).toBe(true);
    expect(isPairingLink("gryt://1:ABC")).toBe(true);
    expect(isPairingLink("gryt://invite?code=abc")).toBe(false);
    expect(isPairingLink("gryt://auth/callback?code=1")).toBe(false);
  });
});

describe("what the approval screen says", () => {
  it("describes the device and where it is", () => {
    expect(deviceLine({ name: "MacBook Air", app: "Gryt desktop", platform: "macOS" })).toBe("Gryt desktop on macOS");
    expect(deviceLine({ name: "x", app: "", platform: "Windows" })).toBe("Windows");
    expect(deviceLine({ name: "x", app: " ", platform: "" })).toBe("No details given");
    expect(locationLine("Oslo, Norway", "Bergen, Norway")).toBe("Near Oslo, Norway. You're near Bergen, Norway.");
    expect(locationLine(null, null)).toBe("Location unknown.");
  });

  it("has words for every way a link can end", () => {
    expect(approverEndText("cancelled")).toBeNull();
    for (const reason of [
      "cancelled_by_other",
      "mismatch",
      "timed_out",
      "expired",
      "already_claimed",
      "unknown_code",
      "wrong_relay",
      "newer_version",
      "not_pairing",
      "rate_limited",
      "tampered",
      "wrong_account",
      "sign_in_failed",
      "relay_error",
      "approve:required_actions",
      "approve:no_token",
      "approve:something_new",
    ] as const) {
      expect(approverEndText(reason)).toMatch(/\.$/);
    }
    expect(approverEndText("approve:something_new")).toContain("something_new");
  });

  it("counts the seconds down to zero and no further", () => {
    expect(secondsLeft(61_000, 1_000)).toBe(60);
    expect(secondsLeft(1_500, 1_000)).toBe(1);
    expect(secondsLeft(1_000, 5_000)).toBe(0);
  });
});
