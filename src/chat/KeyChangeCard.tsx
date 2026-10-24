import type { PeerKeyDecision, PeerPin } from "@gryt/crypto";
import { Text, useTheme } from "@gryt/ui-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { isNotThem, newKeyCode, setNotThem, trustNewKey, undoTrust } from "../connection/keyChange";

type Changed = Extract<PeerKeyDecision, { kind: "changed" }>;

/**
 * Above a DM whose other person's key changed (GRYT-1877): their code to compare, and "It's them"
 * or "It's not them". Nothing goes to the new key until somebody says it's them.
 */
export function KeyChangeCard({
  host,
  memberId,
  name,
  decision,
  trusted,
  onTrusted,
  onUndone,
}: {
  host: string;
  memberId: string;
  name: string;
  /** Null once it's trusted and the member list says "known". */
  decision: Changed | null;
  /** The pin from before "It's them", while undo is still offered. */
  trusted: PeerPin | null;
  onTrusted(previous: PeerPin): void;
  onUndone(): void;
}) {
  const theme = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [notThem, setNotThemState] = useState(false);

  useEffect(() => {
    if (!decision) return;
    let live = true;
    void newKeyCode(host, decision).then((c) => live && setCode(c)).catch(() => live && setCode(null));
    void isNotThem(host, memberId, decision).then((v) => live && setNotThemState(v));
    return () => { live = false; };
  }, [host, memberId, decision]);

  const box = {
    marginHorizontal: theme.space(4),
    marginBottom: theme.space(2),
    padding: theme.space(3),
    gap: theme.space(2),
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceRaised,
  };
  const link = { color: theme.color.text, fontSize: 14, textDecorationLine: "underline" as const };

  if (!decision && trusted) {
    return (
      <View style={box}>
        <Text style={{ color: theme.color.text, fontSize: 14, lineHeight: 20 }}>
          You said it’s {name}. Messages to their new key go through now.{" "}
          <Text accessibilityRole="link" style={link} onPress={() => void undoTrust(host, memberId, trusted).then(onUndone)}>
            Undo
          </Text>
        </Text>
      </View>
    );
  }
  if (!decision) return null;

  if (notThem) {
    return (
      <View style={box}>
        <Text style={{ color: theme.color.text, fontSize: 14, lineHeight: 20 }}>
          You said this isn’t {name}. Messages to them stay paused.{" "}
          <Text
            accessibilityRole="link"
            style={link}
            onPress={() => void setNotThem(host, memberId, decision, false).then(() => setNotThemState(false))}
          >
            Check again
          </Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={box}>
      <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{name}’s key changed</Text>
      <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
        That happens when they set Gryt up on a new phone, or start over. It could also be someone
        pretending to be them. Ask {name} to read you the code on their card, somewhere other than Gryt.
      </Text>
      {code ? (
        <Text selectable style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", letterSpacing: 1 }}>
          {code}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void trustNewKey(host, memberId, decision).then(onTrusted)}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: theme.space(2),
            borderRadius: theme.radius.full,
            alignItems: "center",
            backgroundColor: theme.color.accent,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: theme.color.onAccent, fontSize: 15, fontWeight: "700" }}>It’s them</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void setNotThem(host, memberId, decision, true).then(() => setNotThemState(true))}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: theme.space(2),
            borderRadius: theme.radius.full,
            alignItems: "center",
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>It’s not them</Text>
        </Pressable>
      </View>
    </View>
  );
}
