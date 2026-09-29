import type { MlsOwnDevice } from "@gryt/core";

/* The line on the approval screen when a server already has as many of your devices as it
   takes (GRYT-1575). The desktop shows the same words (GRYT-1582). */

/** MLS takes five devices per person per server; a sixth isn't added to DMs there. */
export const MAX_OWN_DEVICES = 5;

export function deviceLimitLine(serverName: string): string {
  return `${serverName} already has ${MAX_OWN_DEVICES} of your devices, so the new one won't get your DMs there. Remove one first.`;
}

/** One line per server that's full. A server whose list couldn't be read says nothing. */
export function deviceLimitLines(counts: readonly { name: string; count: number | null }[]): string[] {
  return counts.filter((c) => c.count !== null && c.count >= MAX_OWN_DEVICES).map((c) => deviceLimitLine(c.name));
}

/** Each server's device count, from its MLS session. No session, or a failed read, is null. */
export async function ownDeviceCounts(
  servers: readonly { host: string; name: string }[],
  sessionOn: (host: string) => { ownDevices(): Promise<MlsOwnDevice[]> } | null | undefined,
): Promise<{ name: string; count: number | null }[]> {
  return Promise.all(
    servers.map(async ({ host, name }) => {
      const session = sessionOn(host);
      if (!session) return { name, count: null };
      try {
        return { name, count: (await session.ownDevices()).length };
      } catch {
        return { name, count: null };
      }
    }),
  );
}
