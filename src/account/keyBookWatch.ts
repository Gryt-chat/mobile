import { foreignKeyDay, type KeyBookEntry, keyBookId } from "@gryt/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";

import { getOrCreateSeed } from "../identity/seed";
import { jwkThumbprint } from "../identity/keys";
import { accountKeyJwk } from "./certificate";
import { accountConfig } from "./config";

/** A key none of your devices made, once per key. The first look only remembers what's there. */
export async function watchKeyBook(sub: string): Promise<void> {
  const base = accountConfig().identityUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/account-key/book/${encodeURIComponent(sub)}`).catch(() => null);
  const body = res?.ok ? ((await res.json().catch(() => null)) as { book?: KeyBookEntry[] } | null) : null;
  if (!Array.isArray(body?.book)) return;
  const book = body.book;
  const mine = jwkThumbprint(accountKeyJwk(await getOrCreateSeed()));
  const store = `gryt.keyBookSeen.${sub}`;
  const raw = await AsyncStorage.getItem(store).catch(() => null);
  await AsyncStorage.setItem(store, JSON.stringify(book.map(keyBookId))).catch(() => undefined);
  const day = foreignKeyDay(book, mine, raw ? new Set(JSON.parse(raw) as string[]) : null);
  if (!day) return;
  const on = new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  Alert.alert(
    "Your account has a new key",
    `On ${on} your account got a key none of your devices made. If you didn't reset your account, change your password.`,
    [
      { text: "Change password", onPress: () => void WebBrowser.openBrowserAsync(`${accountConfig().issuer.replace(/\/+$/, "")}/account`) },
      { text: "I reset it", style: "cancel" },
    ],
  );
}
