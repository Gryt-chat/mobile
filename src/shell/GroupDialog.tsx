import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Button, Dialog, Text, TextInput, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { eggAvatarSvg } from "@gryt/owl";
import { attachmentUrl } from "../chat/files";
import { conversationTitle, type DirectConversation } from "../connection/directMessages";
import { useMembers } from "../connection/MembersProvider";
import type { Member } from "../connection/types";

/**
 * Starting a group, and managing one.
 *
 * One screen for both, because they ask the same questions — what is it
 * called, what does it look like, who is in it — and a separate edit screen
 * would be the same fields with a different word on the button.
 *
 * There is no owner. Anybody in a group can rename it, repicture it, add
 * somebody, or leave; nobody can remove anybody else. A conversation with no
 * moderators does not need a moderation model.
 */
export function GroupDialog({
  open,
  onOpenChange,
  host,
  me,
  existing,
  initialMemberIds = [],
  uploadImage,
  onCreate,
  onUpdate,
  onAdd,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: string | null;
  /** Your own id, so you are not offered as somebody to add. */
  me?: string | null;
  /** Managing this one, or starting a new one when absent. */
  existing?: DirectConversation;
  /** Ticked to begin with — whoever this was started from. */
  initialMemberIds?: string[];
  /** Hands back a file id, or throws with something worth showing. */
  uploadImage: (uri: string, name: string) => Promise<string>;
  onCreate: (memberIds: string[], name?: string, iconFileId?: string | null) => void;
  onUpdate: (
    conversationId: string,
    changes: { name?: string | null; iconFileId?: string | null },
  ) => void;
  onAdd: (conversationId: string, targetServerUserId: string) => void;
  onLeave: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const { all, avatarUrlFor } = useMembers();
  const managing = !!existing;

  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  /* `undefined` is unchanged, `null` is "go back to the drawn one", a string is
     an upload. One string cannot carry the middle answer. */
  const [iconFileId, setIconFileId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* Reset on open rather than on mount. The dialog outlives one use of it, so
     a name typed and cancelled would still be sitting there next time. */
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setPicked(existing ? existing.members.map((m) => m.server_user_id) : initialMemberIds);
    setIconFileId(undefined);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.conversation_id]);

  const candidates = useMemo(
    () =>
      all
        .filter((m) => m.serverUserId !== me)
        .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [all, me],
  );

  const alreadyIn = useMemo(
    () => new Set(existing?.members.map((m) => m.server_user_id) ?? []),
    [existing],
  );

  const title =
    name.trim() ||
    (existing ? conversationTitle(existing) : "") ||
    candidates
      .filter((m) => picked.includes(m.serverUserId))
      .map((m) => m.nickname)
      .join(", ") ||
    "New group";

  const shownIcon = iconFileId === undefined ? (existing?.icon_file_id ?? null) : iconFileId;
  const shownIconUrl = shownIcon && host ? attachmentUrl(host, shownIcon) : null;
  const enoughPeople = managing || picked.length >= 2;

  const pickImage = async () => {
    setProblem(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setProblem("Gryt needs access to your photos to use one here.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    setBusy(true);
    try {
      setIconFileId(await uploadImage(asset.uri, asset.fileName || "group.jpg"));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not upload that picture.");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (managing && existing) {
      const trimmed = name.trim();
      const changes: { name?: string | null; iconFileId?: string | null } = {};
      if ((existing.name ?? "") !== trimmed) changes.name = trimmed || null;
      if (iconFileId !== undefined) changes.iconFileId = iconFileId;
      if (Object.keys(changes).length > 0) onUpdate(existing.conversation_id, changes);
      for (const id of picked) if (!alreadyIn.has(id)) onAdd(existing.conversation_id, id);
    } else {
      if (!enoughPeople) return;
      onCreate(picked, name.trim() || undefined, iconFileId ?? undefined);
    }
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>{managing ? "Group settings" : "New group"}</Dialog.Title>
          <Dialog.Description>
            {managing
              ? "Anybody here can rename it or add people. Nobody can remove anybody else."
              : "The conversation you already had with them stays where it is."}
          </Dialog.Description>

          <View style={{ gap: theme.space(4) }}>
            <View style={{ alignItems: "center", gap: theme.space(2) }}>
              {shownIconUrl ? (
                <PersonAvatar name={title} source={shownIconUrl} size={64} variant="framed" />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radius.md,
                    overflow: "hidden",
                  }}
                >
                  <SvgXml xml={eggAvatarSvg(title)} width={64} height={64} />
                </View>
              )}

              <View style={{ flexDirection: "row", gap: theme.space(2) }}>
                <Button tone="ghost" size="small" disabled={busy} onPress={pickImage}>
                  {busy ? "Uploading…" : "Choose a picture"}
                </Button>
                {shownIcon ? (
                  <Button tone="ghost" size="small" onPress={() => setIconFileId(null)}>
                    Use the egg
                  </Button>
                ) : null}
              </View>

              <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                {shownIcon ? "Your picture" : "Drawn from the name"}
              </Text>
            </View>

            <View style={{ gap: theme.space(2) }}>
              <Text style={{ fontWeight: "700" }}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={managing ? conversationTitle(existing) : "Optional"}
                placeholderTextColor={theme.color.muted}
                maxLength={80}
              />
              <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                Leave it empty and the group is named after whoever is in it.
              </Text>
            </View>

            <View style={{ gap: theme.space(2) }}>
              <Text style={{ fontWeight: "700" }}>
                {managing ? "Add people" : `People — ${picked.length} picked`}
              </Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {candidates.map((member) => (
                  <PickRow
                    key={member.serverUserId}
                    member={member}
                    avatarUrl={avatarUrlFor(member)}
                    checked={alreadyIn.has(member.serverUserId) || picked.includes(member.serverUserId)}
                    locked={alreadyIn.has(member.serverUserId)}
                    onToggle={() =>
                      setPicked((prev) =>
                        prev.includes(member.serverUserId)
                          ? prev.filter((id) => id !== member.serverUserId)
                          : [...prev, member.serverUserId],
                      )
                    }
                  />
                ))}
              </ScrollView>
              {!managing && !enoughPeople ? (
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                  Pick at least two people. Two of you is a direct message, which you already have.
                </Text>
              ) : null}
            </View>

            {problem ? (
              <Text style={{ color: theme.color.danger, fontSize: 13 }}>{problem}</Text>
            ) : null}
          </View>

          <Dialog.Footer>
            {managing && existing ? (
              <Button
                tone="danger"
                onPress={() => {
                  onLeave(existing.conversation_id);
                  onOpenChange(false);
                }}
              >
                Leave group
              </Button>
            ) : null}
            <Button tone="ghost" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onPress={submit} disabled={!enoughPeople || busy}>
              {managing ? "Save" : "Create group"}
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickRow({
  member,
  avatarUrl,
  checked,
  locked,
  onToggle,
}: {
  member: Member;
  avatarUrl: string | null;
  checked: boolean;
  /** Already in the group, so the row says so instead of offering a no-op. */
  locked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={locked ? undefined : onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius.md,
        opacity: locked ? 0.55 : 1,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: theme.radius.sm,
          borderWidth: 2,
          borderColor: checked ? theme.color.accent : theme.color.border,
          backgroundColor: checked ? theme.color.accent : "transparent",
        }}
      />
      <PersonAvatar name={member.nickname} source={avatarUrl} size={24} variant="bare" />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {member.nickname}
      </Text>
      {locked ? (
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>Already in</Text>
      ) : null}
    </Pressable>
  );
}
