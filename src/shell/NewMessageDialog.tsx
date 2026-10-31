import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "@gryt/ui-native";
import { Dialog } from "../ui/Dialog";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useAllMembers } from "../connection/AllConversationsProvider";
import { useConnections } from "../connection/ConnectionsProvider";
import { fakeDmsOn, fakeMembers } from "../dev/fakeDms";
import { STATUS_LABEL, type Status } from "./data";
import { statusColor } from "./MessagesScreen";
import { useShell } from "./ShellContext";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { conversationTitle } from "../connection/directMessages";
import { useMembers } from "../connection/MembersProvider";
import { useReachable } from "../connection/useReachable";
import type { Member } from "../connection/types";
import { GroupFaceFields, PickRow } from "./GroupDialog";
import { createdGroup, matching, mayOffer, pickable } from "./newMessage";

/**
 * New on the Messages tab: somebody on this server, or a group of them. The
 * phone lists one server's conversations, so this offers that server's people.
 */

/** Long enough for a slow server, short enough that a dead one doesn't look like a hang. */
const ANSWER_MS = 10_000;

export function NewMessageDialog({
  open,
  onOpenChange,
  host,
  me,
  canGroup,
  uploadImage,
  onMessage,
  onMessageOn,
  onOpenConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: string | null;
  me: string | null;
  /** `create_groups` on this server. */
  canGroup: boolean;
  uploadImage: (uri: string, name: string) => Promise<string>;
  /** Open or start the DM with this person, the way a member row does. */
  onMessage: (serverUserId: string) => void;
  /** Set on the Messages tab: anybody on any server, and a DM there switches to it (P5). */
  onMessageOn?: (host: string, serverUserId: string) => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const { all, avatarUrlFor } = useMembers();
  const { conversations, createGroup, updateGroup, error, errorAt } = useDirectMessages();

  const [mode, setMode] = useState<"message" | "group">("message");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<{ before: ReadonlySet<string>; since: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The group just made, once the server has sent it: the name and picture step. */
  const [made, setMade] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const sentName = useRef("");

  useEffect(() => {
    if (!open) return;
    setMode("message");
    setQuery("");
    setPicked([]);
    setWaiting(null);
    setProblem(null);
    setMade(null);
    setName("");
    setIcon(null);
    sentName.current = "";
  }, [open]);

  /* Every server's people at once, each with the server it's on: two Oles can be two people. */
  const allMembers = useAllMembers();
  const reachable = useReachable(open && !fakeDmsOn, onMessageOn ? allMembers : { [host ?? ""]: all });

  const everyone = useMemo(() => pickable(all, me).filter((m) => mayOffer(reachable, host, m.serverUserId)), [all, me, reachable, host]);
  const shown = matching(everyone, query);

  const { byHost } = useConnections();
  const { servers } = useShell();
  const serverName = (h: string) => servers.find((s) => s.host === h)?.name || h;
  const everywhere = useMemo(() => {
    if (!onMessageOn) return [];
    const lists = fakeDmsOn && host ? { [host]: fakeMembers() } : allMembers;
    return Object.entries(lists)
      .flatMap(([h, list]) => pickable(list, fakeDmsOn ? "you" : byHost[h]?.me?.serverUserId).filter((m) => mayOffer(reachable, h, m.serverUserId)).map((member) => ({ host: h, member })))
      .sort((a, b) => a.member.nickname.localeCompare(b.member.nickname, undefined, { sensitivity: "base" }) || a.host.localeCompare(b.host));
  }, [onMessageOn, allMembers, byHost, host, reachable]);
  const needle = query.trim().toLowerCase();
  const shownEverywhere = everywhere.filter((e) => !needle || e.member.nickname.toLowerCase().includes(needle) || serverName(e.host).toLowerCase().includes(needle));

  /* The server answers `dm:group:create` with a `dm:opened` and no request id, so the
     answer is a group that wasn't there before, with exactly these people. */
  useEffect(() => {
    if (!waiting) return;
    const found = createdGroup(conversations, waiting.before, picked);
    if (!found) return;
    setWaiting(null);
    setMade(found.conversation_id);
  }, [waiting, conversations, picked]);

  // A refusal after the ask ends the wait, and says why where the button is.
  useEffect(() => {
    if (!waiting || errorAt <= waiting.since) return;
    setWaiting(null);
    setProblem(error);
  }, [waiting, error, errorAt]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setWaiting(null);
      setProblem("The server didn’t answer. Try again in a moment.");
    }, ANSWER_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const madeGroup = made ? conversations.find((c) => c.conversation_id === made) : undefined;

  const sendName = () => {
    const trimmed = name.trim();
    if (!made || trimmed === sentName.current) return;
    sentName.current = trimmed;
    updateGroup(made, { name: trimmed || null });
  };

  /* Closing is done: the name goes if it changed, and the group opens once the
     dialog is out of the way, the order the member drawer uses. */
  const close = () => {
    setWaiting(null);
    onOpenChange(false);
    if (made) {
      sendName();
      onOpenConversation(made);
    }
  };

  const message = (member: Member, on?: string) => {
    onOpenChange(false);
    if (on && onMessageOn) onMessageOn(on, member.serverUserId);
    else onMessage(member.serverUserId);
  };

  /* A face with its dot, the name, and the server under it: AFK or Offline after it when so. */
  const personRow = (h: string, member: Member) => {
    const status = member.status as Status | undefined;
    const quiet = status === "afk" || status === "offline";
    return (
      <Pressable
        key={`${h}/${member.serverUserId}`}
        onPress={() => message(member, h)}
        accessibilityRole="button"
        accessibilityLabel={`Message ${member.nickname} on ${serverName(h)}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          paddingVertical: theme.space(2),
          paddingHorizontal: theme.space(2),
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
        })}
      >
        <View style={{ width: 36, height: 36 }}>
          <PersonAvatar name={member.nickname} source={avatarUrlFor(member)} size={36} />
          {status ? (
            <View style={{ position: "absolute", right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor(theme, status) }} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{member.nickname}</Text>
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
            {quiet && status ? `${serverName(h)} \u00b7 ${STATUS_LABEL[status]}` : serverName(h)}
          </Text>
        </View>
      </Pressable>
    );
  };

  const toggle = (member: Member) =>
    setPicked((prev) =>
      prev.includes(member.serverUserId)
        ? prev.filter((id) => id !== member.serverUserId)
        : [...prev, member.serverUserId],
    );

  const start = () => {
    if (picked.length < 2) return;
    setProblem(null);
    setWaiting({ before: new Set(conversations.map((c) => c.conversation_id)), since: Date.now() });
    createGroup(picked);
  };

  const nobody = onMessageOn ? "There’s nobody else on your servers yet." : "There’s nobody else on this server yet.";
  const emptyText = (onMessageOn && mode === "message" ? everywhere.length === 0 : everyone.length === 0)
    ? nobody
    : `Nobody matches “${query}”.`;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          {made ? (
            <>
              <Dialog.Title>Name and picture</Dialog.Title>
              <Dialog.Description>
                Both are optional, and you can change them later in Group settings.
              </Dialog.Description>
              <View style={{ gap: theme.space(4) }}>
                <GroupFaceFields
                  host={host}
                  title={name.trim() || (madeGroup ? conversationTitle(madeGroup) : "New group")}
                  icon={icon}
                  onIcon={(fileId) => {
                    setIcon(fileId);
                    updateGroup(made, { iconFileId: fileId });
                  }}
                  name={name}
                  onName={setName}
                  onNameDone={sendName}
                  placeholder={madeGroup ? conversationTitle(madeGroup) : "Optional"}
                  uploadImage={uploadImage}
                  onProblem={setProblem}
                />
                {problem ? (
                  <Text style={{ color: theme.color.danger, fontSize: 13 }}>{problem}</Text>
                ) : null}
              </View>
              <Dialog.Footer>
                <Button onPress={close}>Done</Button>
              </Dialog.Footer>
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Dialog.Title>{mode === "group" ? "New group" : "New message"}</Dialog.Title>
                {onMessageOn && mode === "message" && canGroup ? (
                  <Button size="small" tone="neutral" onPress={() => setMode("group")}>New group</Button>
                ) : null}
              </View>
              {onMessageOn && mode === "message" ? null : (
                <Dialog.Description>
                  {mode === "group" ? "Pick two or more people." : "Pick somebody to talk to."}
                </Dialog.Description>
              )}

              <View style={{ gap: theme.space(3) }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search people"
                  placeholderTextColor={theme.color.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />

                <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                  {!!onMessageOn && mode === "message" && (
                    shownEverywhere.length === 0 ? (
                      <Text style={{ color: theme.color.muted, fontSize: 13, paddingVertical: theme.space(2) }}>{emptyText}</Text>
                    ) : (
                      shownEverywhere.map((e) => personRow(e.host, e.member))
                    )
                  )}
                  {!(onMessageOn && mode === "message") && shown.length === 0 && (
                    <Text style={{ color: theme.color.muted, fontSize: 13, paddingVertical: theme.space(2) }}>
                      {emptyText}
                    </Text>
                  )}
                  {!(onMessageOn && mode === "message") && shown.length > 0 && mode === "group" && (
                    shown.map((member) => (
                      <PickRow
                        key={member.serverUserId}
                        member={member}
                        avatarUrl={avatarUrlFor(member)}
                        checked={picked.includes(member.serverUserId)}
                        locked={false}
                        onToggle={() => toggle(member)}
                      />
                    ))
                  )}
                  {!(onMessageOn && mode === "message") && shown.length > 0 && mode !== "group" && (
                    shown.map((member) => (
                      <Pressable
                        key={member.serverUserId}
                        onPress={() => message(member)}
                        accessibilityRole="button"
                        accessibilityLabel={`Message ${member.nickname}`}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.space(3),
                          paddingVertical: theme.space(2),
                          paddingHorizontal: theme.space(2),
                          borderRadius: theme.radius.md,
                          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
                        })}
                      >
                        <PersonAvatar name={member.nickname} source={avatarUrlFor(member)} size={24} variant="bare" />
                        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.color.text }}>
                          {member.nickname}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>

                {onMessageOn && mode === "message" ? (
                  <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                    Somebody on any of your servers. When two people share a name, each shows where.
                  </Text>
                ) : null}
                {mode === "group" && picked.length === 1 ? (
                  <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                    {"Pick one more. With only two of you, it\u2019s a direct message."}
                  </Text>
                ) : null}
                {problem ? (
                  <Text style={{ color: theme.color.danger, fontSize: 13 }}>{problem}</Text>
                ) : null}
              </View>

              <Dialog.Footer>
                {mode === "group" && (
                  <Button
                    tone="ghost"
                    disabled={waiting !== null}
                    onPress={() => {
                      setMode("message");
                      setPicked([]);
                      setProblem(null);
                    }}
                  >
                    Back
                  </Button>
                )}
                {mode !== "group" && !!canGroup && !onMessageOn && (
                  <Button tone="ghost" onPress={() => setMode("group")}>
                    Create group
                  </Button>
                )}
                <Button tone="ghost" onPress={close}>
                  Cancel
                </Button>
                {mode === "group" ? (
                  <Button onPress={start} disabled={picked.length < 2 || waiting !== null}>
                    {waiting ? "Creating\u2026" : "Create group"}
                  </Button>
                ) : null}
              </Dialog.Footer>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
