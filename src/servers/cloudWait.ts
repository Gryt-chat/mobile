import AsyncStorage from "@react-native-async-storage/async-storage";

/** While Add a server waits on the browser checkout, the next invite link is the new Cloud server. */
let waiting = false;
export const cloudWait = {
  start: () => void (waiting = true),
  stop: () => void (waiting = false),
  active: () => waiting,
};

const key = (host: string) => `gryt:cloud-welcome:${host}`;

/** 3.5 is shown once, on the owner's first open of the new server. */
export function markCloudWelcome(host: string) {
  void AsyncStorage.setItem(key(host), "1").catch(() => {});
}

/** Reads and clears the flag in one go, so the welcome can't come back. */
export async function takeCloudWelcome(host: string): Promise<boolean> {
  const on = (await AsyncStorage.getItem(key(host)).catch(() => null)) === "1";
  if (on) await AsyncStorage.removeItem(key(host)).catch(() => {});
  return on;
}
