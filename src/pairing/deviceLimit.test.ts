import type { MlsOwnDevice } from "@gryt/core";
import { describe, expect, it } from "vitest";

import { deviceLimitLines, ownDeviceCounts } from "./deviceLimit";

const devices = (n: number): MlsOwnDevice[] =>
  Array.from({ length: n }, (_, i) => ({
    serverUserId: "me",
    deviceId: `d${i}`,
    name: null,
    addedAt: null,
    lastSeenAt: null,
    thisDevice: i === 0,
  }));

describe("the sixth-device warning (GRYT-1575)", () => {
  it("names each server that already has five of your devices", () => {
    expect(
      deviceLimitLines([
        { name: "Gryt", count: 5 },
        { name: "Friends", count: 4 },
        { name: "Work", count: 6 },
        { name: "Offline", count: null },
      ]),
    ).toEqual([
      "Gryt already has 5 of your devices, so the new one won't get your DMs there. Remove one first.",
      "Work already has 5 of your devices, so the new one won't get your DMs there. Remove one first.",
    ]);
  });

  it("counts from each server's session, and says nothing for one it can't read", async () => {
    const sessions: Record<string, { ownDevices(): Promise<MlsOwnDevice[]> }> = {
      "full.example": { ownDevices: async () => devices(5) },
      "roomy.example": { ownDevices: async () => devices(2) },
      "broken.example": {
        ownDevices: async () => {
          throw new Error("offline");
        },
      },
    };
    const counts = await ownDeviceCounts(
      [
        { host: "full.example", name: "Full" },
        { host: "roomy.example", name: "Roomy" },
        { host: "broken.example", name: "Broken" },
        { host: "no-mls.example", name: "No MLS" },
      ],
      (host) => sessions[host],
    );
    expect(counts).toEqual([
      { name: "Full", count: 5 },
      { name: "Roomy", count: 2 },
      { name: "Broken", count: null },
      { name: "No MLS", count: null },
    ]);
    expect(deviceLimitLines(counts)).toHaveLength(1);
  });
});
