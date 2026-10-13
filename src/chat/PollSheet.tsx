import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { type NewPoll, POLL_DURATIONS, POLL_OPTION_MAX, POLL_OPTIONS_MAX, POLL_QUESTION_MAX } from "./polls";

const DEFAULT_DURATION = POLL_DURATIONS[1].seconds;

/** + → Poll on the phone (GRYT-1732). The same fields as the desktop dialog, as a sheet. */
export function PollSheet({
  visible,
  roles,
  onClose,
  onPost,
}: {
  visible: boolean;
  /** This server's roles, for a poll only some may answer. */
  roles: { id: string; name?: string; color?: string | null }[];
  onClose: () => void;
  onPost: (poll: NewPoll) => void;
}) {
  const theme = useTheme();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [duration, setDuration] = useState<number | null>(DEFAULT_DURATION);
  const [limitRoles, setLimitRoles] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
    setAnonymous(false);
    setDuration(DEFAULT_DURATION);
    setLimitRoles(false);
    setPicked([]);
  }, [visible]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const repeated = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length;
  const canPost = question.trim().length > 0 && filled.length >= 2 && !repeated && (!limitRoles || picked.length > 0);

  // One empty row stays at the end to type into, up to the limit.
  const setOption = (i: number, value: string) => setOptions((prev) => {
    const next = prev.map((o, j) => (j === i ? value : o));
    if (!next.some((o) => !o.trim()) && next.length < POLL_OPTIONS_MAX) next.push("");
    return next;
  });
  const removeOption = (i: number) => setOptions((prev) => {
    const next = prev.filter((_, j) => j !== i);
    while (next.length < 2) next.push("");
    return next;
  });
  const move = (from: number, to: number) => setOptions((prev) => {
    if (to < 0 || to >= prev.length) return prev;
    const next = prev.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    return next;
  });

  const post = () => {
    if (!canPost) return;
    onPost({
      question: question.trim(),
      options: filled,
      multi,
      anonymous,
      ends_in_seconds: duration,
      allowed_roles: limitRoles ? picked : null,
    });
    onClose();
  };

  const field = {
    minHeight: 44,
    paddingHorizontal: theme.space(3.5),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    color: theme.color.text,
    fontSize: 16,
  } as const;
  const label = { fontSize: 13, fontWeight: "700", color: theme.color.muted } as const;
  const pill = (on: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space(1.5),
    height: 36,
    paddingHorizontal: theme.space(3.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: on ? theme.color.accent : theme.color.border,
    backgroundColor: on ? theme.alpha.accent[2] : "transparent",
  });
  const toggle = (title: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16 }}>{title}</Text>
        <Text style={{ fontSize: 13, color: theme.color.muted }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.color.surfaceRaised }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.space(4) }}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 16, color: theme.color.accent }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>New poll</Text>
          <Pressable onPress={post} disabled={!canPost} accessibilityRole="button" accessibilityState={{ disabled: !canPost }} hitSlop={8}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: canPost ? theme.color.accent : theme.color.muted }}>Post</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.space(4), paddingTop: 0, gap: theme.space(4) }}>
          <View style={{ gap: theme.space(1.5) }}>
            <Text style={label}>Question</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              maxLength={POLL_QUESTION_MAX}
              placeholder="What are we playing Friday?"
              placeholderTextColor={theme.color.muted}
              autoFocus
              style={field}
            />
          </View>

          <View style={{ gap: theme.space(2) }}>
            <Text style={label}>Options</Text>
            {options.map((o, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(1) }}>
                <TextInput
                  value={o}
                  onChangeText={(v) => setOption(i, v)}
                  maxLength={POLL_OPTION_MAX}
                  placeholder={i < 2 ? `Option ${i + 1}` : "Add an option"}
                  placeholderTextColor={theme.color.muted}
                  accessibilityLabel={`Option ${i + 1}`}
                  style={[field, { flex: 1 }]}
                />
                {o.trim() ? (
                  <>
                    <Pressable onPress={() => move(i, i - 1)} disabled={i === 0} accessibilityLabel={`Move option ${i + 1} up`} hitSlop={4} style={{ padding: theme.space(1.5), opacity: i === 0 ? 0.3 : 1 }}>
                      <ArrowUpIcon size={18} color={theme.color.muted} />
                    </Pressable>
                    <Pressable onPress={() => move(i, i + 1)} disabled={!options[i + 1]?.trim()} accessibilityLabel={`Move option ${i + 1} down`} hitSlop={4} style={{ padding: theme.space(1.5), opacity: options[i + 1]?.trim() ? 1 : 0.3 }}>
                      <ArrowDownIcon size={18} color={theme.color.muted} />
                    </Pressable>
                    <Pressable onPress={() => removeOption(i)} accessibilityLabel={`Remove option ${i + 1}`} hitSlop={4} style={{ padding: theme.space(1.5) }}>
                      <XIcon size={18} color={theme.color.muted} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ))}
            {repeated ? <Text style={{ fontSize: 13, color: theme.color.danger }}>Two of the options are the same.</Text> : null}
          </View>

          {toggle("Allow more than one answer", "People can pick several options.", multi, setMulti)}
          {toggle("Anonymous", "Nobody sees who voted for what, only the totals.", anonymous, setAnonymous)}
          {toggle("Only some roles can answer", "Everyone else sees the results.", limitRoles, setLimitRoles)}
          {limitRoles ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(1.5) }}>
              {roles.filter((r) => r.id !== "owner").map((r) => {
                const on = picked.includes(r.id);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setPicked((prev) => (on ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={pill(on)}
                  >
                    {r.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} /> : null}
                    <Text style={{ color: theme.color.text, fontSize: 14 }}>{r.name ?? r.id}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={{ gap: theme.space(1.5) }}>
            <Text style={label}>Ends</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(1.5) }}>
              {POLL_DURATIONS.map((d) => (
                <Pressable
                  key={d.label}
                  onPress={() => setDuration(d.seconds)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: duration === d.seconds }}
                  style={pill(duration === d.seconds)}
                >
                  <Text style={{ color: theme.color.text, fontSize: 14 }}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
