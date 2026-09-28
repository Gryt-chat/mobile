import type { MlsOwnDevice } from "@gryt/core";
import { describe, expect, it } from "vitest";

import { orderOwnDevices, ownDeviceAdded, ownDeviceLabel, removeOwnDeviceWarning } from "./ownDevices";

const dev = (deviceId: string, extra: Partial<MlsOwnDevice> = {}): MlsOwnDevice => ({
  serverUserId: "kari",
  deviceId,
  name: null,
  addedAt: null,
  lastSeenAt: null,
  thisDevice: false,
  ...extra,
});

describe("the device list", () => {
  const listed = [
    dev("old", { name: "Desktop", addedAt: "2026-09-01T10:00:00.000Z" }),
    dev("unseen"),
    dev("here", { name: "iPhone", thisDevice: true, addedAt: "2026-09-20T10:00:00.000Z" }),
  ];

  it("puts this device first and keeps the server's order after it", () => {
    expect(orderOwnDevices(listed).map((d) => d.deviceId)).toEqual(["here", "old", "unseen"]);
  });

  it("names a device no group shows, and leaves out a date the server didn't send", () => {
    expect(ownDeviceLabel(listed[1])).toBe("Another device");
    expect(ownDeviceAdded(listed[0])).toMatch(/^Added .*2026/);
    expect(ownDeviceAdded(listed[1])).toBeNull();
  });

  it("says what removing one does, in the desktop's words", () => {
    expect(removeOwnDeviceWarning(listed[0], "Gryt Community")).toBe(
      "“Desktop” won't get new encrypted DMs on Gryt Community anymore. Messages already on it stay there.",
    );
    expect(removeOwnDeviceWarning(listed[1], "Gryt Community")).toMatch(/^That device won't/);
  });
});
