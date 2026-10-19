import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

import type { PublicPoll } from "../connection/types";
import { endsInText, nextPicks, pollPercent } from "./polls";

/**
 * A poll in a message (GRYT-1732), drawn to the phone draft. Options until you vote,
 * bars after. Holding an option lists who picked it, unless the poll is anonymous.
 */
export function Poll({
  poll,
  roleIds,
  roleName,
  nameOf,
  onVote,
}: {
  poll: PublicPoll;
  /** The roles you hold here, for a poll only some may answer. */
  roleIds: readonly string[];
  roleName: (id: string) => string;
  nameOf: (serverUserId: string) => string;
  /** Absent where you may not react in this channel, which is what voting asks for. */
  onVote?: (choices: number[]) => void;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!poll.ends_at || poll.closed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [poll.ends_at, poll.closed]);

  const mine = poll.mine ?? [];
  const ended = poll.closed || (!!poll.ends_at && new Date(poll.ends_at).getTime() <= now);
  const roleOk = !poll.allowed_roles || poll.allowed_roles.some((r) => roleIds.includes(r));
  const vote = !ended && roleOk ? onVote : undefined;
  const results = ended || mine.length > 0 || !vote;
  const top = Math.max(0, ...poll.options.map((o) => o.count));
  const votes = `${poll.voter_count} vote${poll.voter_count === 1 ? "" : "s"}`;
  const ends = ended ? null : endsInText(poll.ends_at, now);
  const roles = (poll.allowed_roles ?? []).map(roleName);

  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={`Poll: ${poll.question}`}
      style={{
        marginTop: theme.space(1.5),
        padding: theme.space(3.5),
        gap: theme.space(2.5),
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surfaceRaised,
      }}
    >
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>{poll.question}</Text>
      {!results ? (
        <Text style={{ fontSize: 13, color: theme.color.muted, marginTop: -theme.space(1.5) }}>
          {poll.multi ? "Pick one or more" : "Pick one"}
        </Text>
      ) : null}
      {poll.options.map((o, i) => {
        const picked = mine.includes(i);
        const pct = pollPercent(o.count, poll.voter_count);
        const winner = ended && o.count > 0 && o.count === top;
        const voters = o.voters && o.voters.length > 0 ? o.voters : null;
        return (
          <View key={i} style={{ gap: theme.space(1) }}>
            <Pressable
              onPress={vote ? () => vote(nextPicks(poll, mine, i)) : undefined}
              onLongPress={voters ? () => setShown((s) => (s === i ? null : i)) : undefined}
              disabled={!vote && !voters}
              accessibilityRole={poll.multi ? "checkbox" : "radio"}
              accessibilityState={{ checked: picked, disabled: !vote }}
              accessibilityLabel={results ? `${o.text}, ${pct} percent, ${o.count} votes` : o.text}
              style={({ pressed }) => ({
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: picked ? theme.color.accent : theme.color.border,
                backgroundColor: pressed && vote ? theme.color.surfaceHover : theme.color.surface,
                overflow: "hidden",
                justifyContent: "center",
              })}
            >
              {results ? (
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    backgroundColor: picked || winner ? theme.alpha.accent[3] : theme.color.surfaceHover,
                  }}
                />
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2.5), paddingHorizontal: theme.space(3.5), paddingVertical: theme.space(2) }}>
                {results && picked ? <CheckCircleIcon size={18} weight="fill" color={theme.color.accent} /> : null}
                {results ? null : (
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: poll.multi ? 5 : 9,
                      borderWidth: 2,
                      borderColor: theme.color.muted,
                    }}
                  />
                )}
                <Text style={{ color: theme.color.text, flex: 1, fontSize: 15, fontWeight: winner ? "700" : "400" }}>{o.text}</Text>
                {results ? (
                  <>
                    <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>{pct}%</Text>
                    <Text style={{ width: 56, textAlign: "right", fontSize: 13, color: theme.color.muted }}>
                      {o.count} vote{o.count === 1 ? "" : "s"}
                    </Text>
                  </>
                ) : null}
              </View>
            </Pressable>
            {shown === i && voters ? (
              <Text style={{ fontSize: 13, color: theme.color.muted, paddingHorizontal: theme.space(1) }}>
                {voters.map(nameOf).join(", ")}
              </Text>
            ) : null}
          </View>
        );
      })}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        <Text style={{ fontSize: 13, color: theme.color.muted }}>
          {ended ? `Final results · ${votes}` : [votes, ends].filter(Boolean).join(" · ")}
          {poll.anonymous ? " · anonymous" : ""}
          {!ended && mine.length > 0 && vote ? " · " : ""}
        </Text>
        {!ended && mine.length > 0 && vote ? (
          <Pressable onPress={() => vote([])} accessibilityRole="button" hitSlop={6}>
            <Text style={{ fontSize: 13, color: theme.color.accent }}>Take back vote</Text>
          </Pressable>
        ) : null}
      </View>
      {roles.length > 0 ? (
        <Text style={{ fontSize: 13, color: theme.color.muted, marginTop: -theme.space(1.5) }}>
          Only {listOf(roles)} can answer
        </Text>
      ) : null}
    </View>
  );
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
