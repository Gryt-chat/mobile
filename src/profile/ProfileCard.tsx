import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert as AlertBanner, Sheet, Spinner, TextField, Button, useTheme } from "@gryt/ui-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { NICKNAME_MAX, type ProfileState } from "./useProfile";

/**
 * Your picture and your name, at the top of the You page.
 *
 * **The chip under the name is load-bearing.** Both of these are per-server —
 * the nickname is a column on this server's `users` row, the avatar a file in
 * its bucket — so a name shown on a page called "You" with nothing qualifying
 * it is claiming to be global when it is not. The chip is what stops "Sivert"
 * reading as your name everywhere.
 *
 * Nothing here is offered when there is no session to change anything with.
 * The picker and the pencil disappear rather than opening onto an error,
 * because "not joined to anything yet" is a state to be in, not a failure.
 */
export function ProfileCard({
  profile,
  serverName,
  fallbackName,
}: {
  profile: ProfileState;
  /** Which server this name belongs to. Null when you are in none. */
  serverName: string | null;
  /** What to call you before a server has. */
  fallbackName: string;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);

  const name = profile.nickname || fallbackName;

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      /* The system only asks once. After a refusal this is the only way to
       * explain why nothing happened. */
      Alert.alert(
        "Gryt cannot open your photos",
        "Photo access is off for Gryt. Turn it on in Settings to choose a picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      /* Square, because every surface that draws this draws it in a circle or
       * a rounded square. Cropping here beats cropping in six components. */
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    await profile.setAvatar(
      asset.uri,
      asset.mimeType ?? "image/jpeg",
      asset.fileName ?? "avatar.jpg",
    );
  };

  return (
    <View style={{ gap: theme.space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(4) }}>
        <Pressable
          disabled={!profile.editable || profile.saving}
          onPress={() => void pick()}
          accessibilityRole="button"
          accessibilityLabel="Change your picture"
          style={{ opacity: profile.saving ? 0.6 : 1 }}
        >
          <PersonAvatar name={name} source={profile.avatarUrl} size={72} />
          {profile.editable ? (
            <View
              style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 26,
                height: 26,
                borderRadius: theme.radius.full,
                backgroundColor: theme.color.accent,
                alignItems: "center",
                justifyContent: "center",
                /* Cut out of the avatar rather than sitting on it, so the badge
                   reads as attached at any avatar colour. */
                borderWidth: 2,
                borderColor: theme.color.bg,
              }}
            >
              {profile.saving ? (
                <Spinner size="small" color={theme.color.onAccent} />
              ) : (
                <PencilSimpleIcon size={13} color={theme.color.onAccent} weight="bold" />
              )}
            </View>
          ) : null}
        </Pressable>

        <View style={{ flex: 1, gap: 6 }}>
          <Pressable
            disabled={!profile.editable}
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={profile.editable ? `Change your nickname, currently ${name}` : name}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}
          >
            <Text
              numberOfLines={1}
              style={{ color: theme.color.text, fontSize: 28, fontWeight: "700", flexShrink: 1 }}
            >
              {name}
            </Text>
            {profile.editable ? (
              <PencilSimpleIcon size={16} color={theme.color.accent} weight="bold" />
            ) : null}
          </Pressable>

          {serverName ? (
            <View
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: theme.space(3),
                paddingVertical: 3,
                borderRadius: theme.radius.full,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceRaised,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.success,
                }}
              />
              <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
                {serverName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {profile.problem ? <AlertBanner severity="error">{profile.problem}</AlertBanner> : null}

      <NicknameSheet
        open={editing}
        onOpenChange={setEditing}
        current={profile.nickname}
        serverName={serverName}
        onSave={profile.rename}
      />
    </View>
  );
}

/**
 * Renaming yourself, in a sheet.
 *
 * A sheet rather than an inline field for the reason the join sheet is one: it
 * takes a keyboard, and a sheet handles the keyboard where a row on a scrolling
 * page has to be told about it.
 *
 * **Capped at twenty, which is the server's number.** `profile:update` does
 * `.substring(0, 20)` and says nothing — so a longer name saves as its first
 * two-thirds and comes back changed. The counter appears in the last five
 * characters rather than always, so it reads as a limit approaching rather than
 * as a form.
 */
function NicknameSheet({
  open,
  onOpenChange,
  current,
  serverName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  serverName: string | null;
  onSave: (nickname: string) => void;
}) {
  const theme = useTheme();

  return (
    /* Tall enough that the content clears a keyboard, because this sheet
       exists to take one — at 46% the field and the Save button were both
       behind it. The scroll view and the keyboard inset are the other half,
       and the fact that every sheet has to reassemble this by hand is what
       GRYT-492 is about. */
    <Sheet snapPoints={["88%"]} open={open} onOpenChange={onOpenChange}>
      <Sheet.Content style={{ padding: 0, height: "100%" }}>
        <NicknameBody
          // Remounts on each open, so the field starts from what is stored
          // rather than from whatever was abandoned last time.
          key={open ? current : "closed"}
          current={current}
          serverName={serverName}
          onSave={(next) => {
            onSave(next);
            onOpenChange(false);
          }}
        />
      </Sheet.Content>
    </Sheet>
  );
}

function NicknameBody({
  current,
  serverName,
  onSave,
}: {
  current: string;
  serverName: string | null;
  onSave: (nickname: string) => void;
}) {
  const theme = useTheme();
  const [value, setValue] = useState(current);

  const trimmed = value.trim();
  const nearLimit = value.length >= NICKNAME_MAX - 5;

  return (
    <BottomSheetScrollView
      contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4) }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ gap: theme.space(2) }}>
        <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>
          What should we call you?
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 20 }}>
          {serverName
            ? `This is your name on ${serverName}. Other servers keep their own.`
            : "This is your name on this server. Other servers keep their own."}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <TextField
          value={value}
          onChangeText={setValue}
          maxLength={NICKNAME_MAX}
          autoFocus
          /* Selected, not appended to. A rename usually replaces the whole
             name, and a cursor parked at the end turns "Sivert" into
             "YouSivert" for anyone who starts typing. */
          selectTextOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => trimmed && onSave(trimmed)}
          accessibilityLabel="Your nickname"
        />
        {nearLimit ? (
          <Text style={{ color: theme.color.muted, fontSize: 12, alignSelf: "flex-end" }}>
            {value.length}/{NICKNAME_MAX}
          </Text>
        ) : null}
      </View>

      <Button
        tone="primary"
        size="large"
        disabled={!trimmed || trimmed === current}
        onPress={() => onSave(trimmed)}
      >
        Save
      </Button>
    </BottomSheetScrollView>
  );
}
