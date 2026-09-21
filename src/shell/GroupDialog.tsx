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
 * A group's picture and name. Group settings shows them, and so does the step after
 * starting one from the +; each decides when a change is sent.
 */
export function GroupFaceFields({
  host,
  title,
  icon,
  onIcon,
  name,
  onName,
  onNameDone,
  placeholder,
  uploadImage,
  onProblem,
}: {
  host: string | null;
  /** What the egg is drawn from, live, so it changes as the name is typed. */
  title: string;
  /** The picture shown: an upload's file id, or null for the egg. */
  icon: string | null;
  onIcon: (fileId: string | null) => void;
  name: string;
  onName: (name: string) => void;
  /** The field was left, or the keyboard's done key pressed. */
  onNameDone?: () => void;
  placeholder: string;
  /** Hands back a file id, or throws with something worth showing. */
  uploadImage: (uri: string, name: string) => Promise<string>;
  onProblem: (problem: string | null) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const iconUrl = icon && host ? attachmentUrl(host, icon) : null;

  const pickImage = async () => {
    onProblem(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onProblem("Gryt needs access to your photos to use one here.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    setBusy(true);
    try {
      onIcon(await uploadImage(asset.uri, asset.fileName || "group.jpg"));
    } catch (error) {
      onProblem(error instanceof Error ? error.message : "Could not upload that picture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ alignItems: "center", gap: theme.space(2) }}>
        {iconUrl ? (
          <PersonAvatar name={title} source={iconUrl} size={64} variant="framed" />
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
          {icon ? (
            <Button tone="ghost" size="small" onPress={() => onIcon(null)}>
              Use the egg
            </Button>
          ) : null}
        </View>

        <Text style={{ color: theme.color.muted, fontSize: 12 }}>
          {icon ? "Your picture" : "Drawn from the name"}
        </Text>
      </View>

      <View style={{ gap: theme.space(2) }}>
        <Text style={{ fontWeight: "700" }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={onName}
          onBlur={onNameDone}
          onSubmitEditing={onNameDone}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={theme.color.muted}
          maxLength={80}
        />
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>
          Leave it empty and the group is named after whoever is in it.
        </Text>
      </View>
    </>
  );
}

/**
 * A group's settings, one screen. **There is no owner**: anybody in it can rename it,
 * add somebody or leave. Starting one is `NewMessageDialog`.
 */
export function GroupDialog({
  open,
  onOpenChange,
  host,
  me,
  existing,
  canAdd,
  uploadImage,
  onUpdate,
  onAdd,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: string | null;
  /** Your own id, so you are not offered as somebody to add. */
  me?: string | null;
  /** The group these are the settings of. Nothing opens without one. */
  existing?: DirectConversation;
  /** `create_groups`, which adding somebody asks for as well. */
  canAdd: boolean;
  /** Hands back a file id, or throws with something worth showing. */
  uploadImage: (uri: string, name: string) => Promise<string>;
  onUpdate: (
    conversationId: string,
    changes: { name?: string | null; iconFileId?: string | null },
  ) => void;
  onAdd: (conversationId: string, targetServerUserId: string) => void;
  onLeave: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const { all, avatarUrlFor } = useMembers();

  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  /* `undefined` is unchanged, `null` is "go back to the drawn one", a string is
     an upload. One string cannot carry the middle answer. */
  const [iconFileId, setIconFileId] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  /* Reset on open rather than on mount. The dialog outlives one use of it, so
     a name typed and cancelled would still be sitting there next time. */
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setPicked(existing ? existing.members.map((m) => m.server_user_id) : []);
    setIconFileId(undefined);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.conversation_id]);

  // Not you, and not a bot, which the server refuses.
  const candidates = useMemo(
    () =>
      all
        .filter((m) => m.serverUserId !== me && !m.isBot)
        .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [all, me],
  );

  const alreadyIn = useMemo(
    () => new Set(existing?.members.map((m) => m.server_user_id) ?? []),
    [existing],
  );

  if (!existing) return null;

  const title = name.trim() || conversationTitle(existing);
  const shownIcon = iconFileId === undefined ? (existing.icon_file_id ?? null) : iconFileId;

  const submit = () => {
    const trimmed = name.trim();
    const changes: { name?: string | null; iconFileId?: string | null } = {};
    if ((existing.name ?? "") !== trimmed) changes.name = trimmed || null;
    if (iconFileId !== undefined) changes.iconFileId = iconFileId;
    if (Object.keys(changes).length > 0) onUpdate(existing.conversation_id, changes);
    if (canAdd) {
      for (const id of picked) if (!alreadyIn.has(id)) onAdd(existing.conversation_id, id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Group settings</Dialog.Title>
          <Dialog.Description>
            {canAdd
              ? "Anybody here can rename it or add people. Nobody can remove anybody else."
              : "Anybody here can rename it. Nobody can remove anybody else."}
          </Dialog.Description>

          <View style={{ gap: theme.space(4) }}>
            <GroupFaceFields
              host={host}
              title={title}
              icon={shownIcon}
              onIcon={setIconFileId}
              name={name}
              onName={setName}
              placeholder={conversationTitle(existing)}
              uploadImage={uploadImage}
              onProblem={setProblem}
            />

            {canAdd ? (
              <View style={{ gap: theme.space(2) }}>
                <Text style={{ fontWeight: "700" }}>Add people</Text>
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
              </View>
            ) : null}

            {problem ? (
              <Text style={{ color: theme.color.danger, fontSize: 13 }}>{problem}</Text>
            ) : null}
          </View>

          <Dialog.Footer>
            <Button
              tone="danger"
              onPress={() => {
                onLeave(existing.conversation_id);
                onOpenChange(false);
              }}
            >
              Leave group
            </Button>
            <Button tone="ghost" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onPress={submit}>Save</Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A person with a tick box, for Group settings and for starting a group. */
export function PickRow({
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
      accessibilityLabel={member.nickname}
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
