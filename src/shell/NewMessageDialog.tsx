import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Dialog, Text, TextInput, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { conversationTitle } from "../connection/directMessages";
import { useMembers } from "../connection/MembersProvider";
import type { Member } from "../connection/types";
import { GroupFaceFields, PickRow } from "./GroupDialog";
import { createdGroup, matching, pickable } from "./newMessage";

/**
 * The + next to Direct messages: somebody on this server, or a group of them. The
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

  const everyone = useMemo(() => pickable(all, me), [all, me]);
  const shown = matching(everyone, query);

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

  const message = (member: Member) => {
    onOpenChange(false);
    onMessage(member.serverUserId);
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

  const emptyText = everyone.length === 0
    ? "There’s nobody else on this server yet."
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
              <Dialog.Title>{mode === "group" ? "New group" : "New message"}</Dialog.Title>
              <Dialog.Description>
                {mode === "group" ? "Pick two or more people." : "Pick somebody to talk to."}
              </Dialog.Description>

              <View style={{ gap: theme.space(3) }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search people"
                  placeholderTextColor={theme.color.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />

                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                  {shown.length === 0 ? (
                    <Text style={{ color: theme.color.muted, fontSize: 13, paddingVertical: theme.space(2) }}>
                      {emptyText}
                    </Text>
                  ) : mode === "group" ? (
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
                  ) : (
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
                        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                          {member.nickname}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>

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
                {mode === "group" ? (
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
                ) : canGroup ? (
                  <Button tone="ghost" onPress={() => setMode("group")}>
                    Create group
                  </Button>
                ) : null}
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
