import { useState } from "react";
import {
  ActionSheetIOS,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useGrytAccount } from "../account/AccountProvider";
import { authOverride, setAuthOverride } from "../account/config";
import {
  DEFAULT_IDENTITY_URL,
  DEFAULT_ISSUER,
  isDefault,
  toOverride,
} from "../account/authServer";

/**
 * The local stack `ops/start_dev.sh` brings up.
 *
 * Offered as a preset because typing two URLs with port numbers on a phone
 * keyboard is the kind of thing people give up on, and because getting one of
 * the two wrong is the failure this screen exists to make visible rather than
 * to cause.
 *
 * `localhost` is right on a simulator, which shares the Mac's loopback, and
 * wrong on a real phone, where it is the phone. The hint says so rather than
 * guessing at a LAN address that changes with the network.
 */
const LOCAL = {
  issuer: "http://localhost:18080/realms/gryt",
  identityUrl: "http://localhost:18081",
};

/**
 * Which auth server this phone signs in to.
 *
 * Advanced, and behind its own screen rather than a row on Preferences, because
 * getting it wrong signs you out of an account that was working. Gryt is meant
 * to be self-hosted though, and the desktop client has had this for a while —
 * the phone pinning one company's Keycloak while claiming to be the same client
 * was the odd one out. GRYT-505.
 *
 * **It saves as you go.** There is no Save button: a settings screen with one
 * is a thing to remember, and forgetting it means the setting silently did not
 * take.
 *
 * What it does not do is save on every keystroke, and the two reasons are the
 * same two that made a button look right in the first place. The pair has to
 * move together — setting the issuer without the identity service is GRYT-156,
 * a token from the new Keycloak posted to the old certificate authority — and
 * saving signs you out, which is not something to do several times while
 * somebody types a hostname.
 *
 * So a field **losing focus** is what commits, and only when the pair is whole:
 * both set, or both cleared. Half-set holds, and says so. GRYT-513.
 */
export function AuthServerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const account = useGrytAccount();

  const current = authOverride();
  const [issuer, setIssuer] = useState(current.issuer ?? "");
  const [identityUrl, setIdentityUrl] = useState(current.identityUrl ?? "");
  const [saved, setSaved] = useState(false);

  const next = toOverride({ issuer, identityUrl });
  const changed =
    next.issuer !== current.issuer || next.identityUrl !== current.identityUrl;

  /* One without the other is the failure this screen is most likely to cause,
   * so nothing is written until both halves agree — and the reason is on
   * screen rather than reported as a 401 an hour later. */
  const halfSet = Boolean(next.issuer) !== Boolean(next.identityUrl);

  const save = async (override: { issuer: string; identityUrl: string }) => {
    await setAuthOverride(override);
    /* Signed out, always. A session and an identity certificate issued by the
     * old server say nothing about the new one, and leaving them means the next
     * join presents an identity this Keycloak has never heard of. `signOut`
     * clears the certificate with the tokens. */
    await account.signOut();
    setSaved(true);
  };

  const apply = (override: { issuer: string; identityUrl: string }) => {
    setIssuer(override.issuer);
    setIdentityUrl(override.identityUrl);
    ask(() => void save(override), () => revert());
  };

  /** Back to what is actually stored. */
  const revert = () => {
    setIssuer(current.issuer ?? "");
    setIdentityUrl(current.identityUrl ?? "");
  };

  /**
   * What a field losing focus does.
   *
   * Nothing at all in the two cases that are not a change yet: the same values
   * that are already stored, and a pair with only one half filled in. Tabbing
   * between the two fields therefore does not ask anything — it is only the
   * blur that completes the pair that commits.
   */
  const commit = () => {
    if (!changed || halfSet) return;
    ask(() => void save({ issuer, identityUrl }), revert);
  };

  /* Cancelling puts the fields back. With no Save button there would otherwise
   * be no way to commit what is on screen, and nothing saying it had not
   * been — a screen showing one server while the app used another. */
  const ask = (onConfirm: () => void, onCancel: () => void) =>
    confirmChange(account.state.status === "signedIn", onConfirm, onCancel);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          /* The keyboard first, which blurs the field, which is what saves.
             Without it, typing an address and going straight back would drop
             the edit — the one gap in a screen with no Save button. */
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
          Auth server
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
          Where Gryt accounts on this phone come from. Leave both empty to use
          Gryt&apos;s own. Changes save when you leave a field, and signing out
          is part of it — a session from one server means nothing to another.
        </Text>

        <Field
          label="Auth server"
          hint="A Keycloak realm. This is the URL that appears in a token's issuer."
          placeholder={DEFAULT_ISSUER}
          value={issuer}
          onChangeText={(text) => {
            setIssuer(text);
            setSaved(false);
          }}
          onBlur={commit}
        />

        <Field
          label="Identity service"
          /* Spelling out what it is for, because the obvious assumption — that
             it is derived from the auth server — is the one that breaks. */
          hint="Signs the certificate that proves your account to a Gryt server. A separate host from the auth server, so it has to be set too."
          placeholder={DEFAULT_IDENTITY_URL}
          value={identityUrl}
          onChangeText={(text) => {
            setIdentityUrl(text);
            setSaved(false);
          }}
          onBlur={commit}
        />

        {halfSet ? (
          <Alert severity="warning">
            Set both, or neither — nothing is saved until you do. A token from
            one server posted to the other&apos;s identity service is refused
            with an error that does not say why.
          </Alert>
        ) : null}

        {saved ? (
          <Alert severity="success">
            Saved, and signed out. Sign in again from the You tab.
          </Alert>
        ) : null}

        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>
            PRESETS
          </Text>
          <Button tone="neutral" onPress={() => apply(LOCAL)}>
            Local development
          </Button>
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
            {/* No backticks. React Native draws them, so a habit from the
                codebase's comments turns into visible punctuation. */}
            Keycloak and the identity service that ops/start_dev.sh brings up.
            localhost is this Mac from a simulator; on a real phone, use the
            computer&apos;s address on your network.
          </Text>
          <Button
            tone="neutral"
            disabled={isDefault(current) && !issuer && !identityUrl}
            onPress={() => apply({ issuer: "", identityUrl: "" })}
          >
            Use Gryt&apos;s own
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  hint,
  placeholder,
  value,
  onChangeText,
  onBlur,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  /** What commits. See the note on the screen. */
  onBlur: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
        {label}
      </Text>
      <TextField
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        /* So the keyboard's own key finishes the field rather than leaving
           somebody looking for the button that is no longer there. */
        returnKeyType="done"
        accessibilityLabel={label}
      />
      <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
    </View>
  );
}

/**
 * "This signs you out", once, before it happens.
 *
 * Only when there is a session to lose — asking somebody who is signed out to
 * confirm losing nothing is the kind of dialog people learn to dismiss without
 * reading, which is what makes the ones that matter stop working. In dev, where
 * this screen is mostly used, it therefore never appears at all.
 *
 * It survives the move to saving on blur because it is not a save
 * confirmation. The setting is cheap and reversible; the session is neither,
 * and it is the only thing here worth interrupting somebody for. It fires at
 * most once per real change, at the moment the pair completes.
 *
 * An `ActionSheetIOS` rather than a Dialog, for the reason leaving a server
 * uses one: UIKit presents it, so it does not wait for anything else to finish
 * dismissing first.
 */
function confirmChange(signedIn: boolean, onConfirm: () => void, onCancel: () => void) {
  if (!signedIn || Platform.OS !== "ios") {
    onConfirm();
    return;
  }

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: "Change the auth server?",
      message:
        "You will be signed out of your Gryt account. Your servers and your twenty-four words stay exactly as they are.",
      options: ["Change and sign out", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
      userInterfaceStyle: "dark",
    },
    (index) => {
      if (index === 0) onConfirm();
      else onCancel();
    },
  );
}
