import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert as AlertBanner, Sheet, Spinner, Text, TextField, useTheme } from "@gryt/ui-native";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { NICKNAME_MAX, type ProfileScope, type ProfileState } from "./useProfile";

/**
 * Your picture and your name, at the top of the You page.
 *
 * **The line under the name is load-bearing.** In a server both of these are
 * that server's — the nickname is a column on its `users` row, the avatar a
 * file in its bucket — so a name shown on a page called "You" with nothing
 * qualifying it is claiming to be global when it is not. The line is what stops
 * "Sivert" reading as your name everywhere.
 *
 * In no server they are the device's, and the line says that instead. There is
 * always something to edit now, which is the point of GRYT-498: the page used
 * to show a name and quietly refuse to change it.
 *
 * The picker and the pencil still disappear where there is a server and no
 * session to change anything with, rather than opening onto an error.
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

  /* Which server this name belongs to, and nothing about the connection.
   *
   * It used to say "Not connected to <server>" and "Joining <server>…" while
   * the session was missing, on the reasoning that the pencils disappearing
   * with no explanation was a page quietly changing what it can do. Sivert's
   * call, and the right one: the sentence is useless. It reports a transient
   * state nobody can act on, in the one place on the page that exists to say
   * something permanent — which server this name is for. GRYT-496 removes the
   * state it was describing anyway, by keeping every server connected. */
  const caption =
    profile.scope === "device"
      ? "On this device"
      : serverName
        ? `on ${serverName}`
        : null;

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

          {caption ? (
            /* Plain text, and deliberately not a chip with a status dot.
             *
             * It had one, and the dot read as "this server is online" — which
             * is not what this is for and not a thing the page knows. It says
             * which server the name above it belongs to, because both the name
             * and the picture are per-server and a bare name on a page called
             * "You" claims to be global.
             *
             * If the app ever holds a connection to every server at once, one
             * line here stops being the right shape at all — you would have as
             * many names as servers. GRYT-496. */
            <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
      </View>

      {profile.problem ? <AlertBanner severity="error">{profile.problem}</AlertBanner> : null}

      <NicknameSheet
        open={editing}
        onOpenChange={setEditing}
        current={profile.nickname}
        serverName={profile.scope === "device" ? null : serverName}
        scope={profile.scope}
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
 * **No Save button.** The name commits when the field loses focus, and losing
 * focus is what the return key, a tap elsewhere in the sheet, and dismissing
 * the sheet all do — so every way out of here is a way that saves. A button
 * whose only job is to confirm what the field already says is a step to forget,
 * and forgetting it is a rename that silently did not happen. GRYT-513.
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
  scope,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  serverName: string | null;
  scope: ProfileScope;
  onSave: (nickname: string) => void;
}) {
  const theme = useTheme();

  return (
    /* Tall enough that the content clears a keyboard, because this sheet
       exists to take one — at 46% the field was behind it. The snap point is
       the one part `Sheet.ScrollView` cannot decide, since how tall depends on
       what is in the sheet; everything else that used to be assembled here is
       its now. GRYT-492. */
    <Sheet snapPoints={["88%"]} open={open} onOpenChange={onOpenChange}>
      <Sheet.ScrollView>
        <NicknameBody
          // Remounts on each open, so the field starts from what is stored
          // rather than from whatever was abandoned last time. It is also what
          // makes the unmount below a reliable place to flush from: the body
          // goes away exactly when the sheet closes.
          key={open ? current : "closed"}
          current={current}
          serverName={serverName}
          scope={scope}
          onSave={onSave}
          onDone={() => onOpenChange(false)}
        />
      </Sheet.ScrollView>
    </Sheet>
  );
}

function NicknameBody({
  current,
  serverName,
  scope,
  onSave,
  onDone,
}: {
  current: string;
  serverName: string | null;
  scope: ProfileScope;
  onSave: (nickname: string) => void;
  /** Closes the sheet. Saving is separate — see `commit`. */
  onDone: () => void;
}) {
  const theme = useTheme();
  const [value, setValue] = useState(current);

  const nearLimit = value.length >= NICKNAME_MAX - 5;

  /**
   * Save what is in the field, if it is a change.
   *
   * Held in a ref as well, so the cleanup below flushes the *latest* value
   * rather than whatever was current when the effect first ran. Dismissing a
   * bottom sheet does not reliably blur the input first — the sheet and the
   * keyboard are two different pieces of native furniture — so the unmount is
   * the backstop that makes "every way out saves" true rather than nearly true.
   *
   * Committing twice is harmless: `rename` drops a name equal to the one it is
   * already showing, and the second call always is.
   */
  const commit = () => {
    const name = value.trim().slice(0, NICKNAME_MAX);
    if (!name || name === current) return;
    onSave(name);
  };

  const latest = useRef(commit);
  latest.current = commit;

  useEffect(() => () => latest.current(), []);

  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(2) }}>
        <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>
          What should we call you?
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 20 }}>
          {scope === "device"
            ? /* What it does and, more usefully, what it does not: nobody
                 should have to find out by renaming themselves that it left
                 four servers calling them something else. */
              "This is what servers will call you when you join them. Servers you are already in keep the name you have there."
            : serverName
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
          /* The keyboard's own key is the way out now that there is no button.
             It commits through the blur that follows, and closes the sheet. */
          onSubmitEditing={onDone}
          onBlur={commit}
          accessibilityLabel="Your nickname"
        />
        {nearLimit ? (
          <Text style={{ color: theme.color.muted, fontSize: 12, alignSelf: "flex-end" }}>
            {value.length}/{NICKNAME_MAX}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
