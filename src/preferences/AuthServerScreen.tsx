import { useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useGrytAccount } from "../account/AccountProvider";
import { useConfirm } from "../ui/actionSheet";
import { authOverride, setAuthOverride } from "../account/config";
import {
  DEFAULT_IDENTITY_URL,
  DEFAULT_ISSUER,
  isDefault,
  toOverride,
} from "../account/authServer";

/**
 * The local stack `ops/start_dev.sh` brings up, offered as a preset. `localhost` is
 * right on a simulator and wrong on a phone; the hint says so.
 */
const LOCAL = {
  issuer: "http://localhost:18080/realms/gryt",
  identityUrl: "http://localhost:18081",
};

/**
 * Which auth server this phone signs in to. **It saves as you go, on focus loss, and
 * only when the pair is whole** — half-set is GRYT-156, and saving signs you out.
 */
export function AuthServerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const account = useGrytAccount();
  const confirm = useConfirm();

  const current = authOverride();
  const [issuer, setIssuer] = useState(current.issuer ?? "");
  const [identityUrl, setIdentityUrl] = useState(current.identityUrl ?? "");
  const [saved, setSaved] = useState(false);

  const next = toOverride({ issuer, identityUrl });
  const changed =
    next.issuer !== current.issuer || next.identityUrl !== current.identityUrl;

  /* One without the other is the failure this screen is most likely to cause, so
   * nothing is written until both halves agree. */
  const halfSet = Boolean(next.issuer) !== Boolean(next.identityUrl);

  const save = async (override: { issuer: string; identityUrl: string }) => {
    await setAuthOverride(override);
    /* Signed out, always: a session and a certificate from the old server say
     * nothing about the new one. `signOut` clears the certificate too. */
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
   * What a field losing focus does. Nothing when the values are unchanged, and
   * nothing when only one half is filled in — only the completing blur commits.
   */
  const commit = () => {
    if (!changed || halfSet) return;
    ask(() => void save({ issuer, identityUrl }), revert);
  };

  /* Cancelling puts the fields back. With no Save button there would otherwise be no
   * way to commit, and nothing saying it had not been. */
  const ask = (onConfirm: () => void, onCancel: () => void) =>
    void confirmChange(confirm, account.state.status === "signedIn", onConfirm, onCancel);

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
          /* The keyboard first, which blurs the field, which is what saves. Without
             it, typing an address and going straight back drops the edit. */
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
 * "This signs you out", once, before it happens. **Only when there is a session to
 * lose.** **It did not ask at all on Android until GRYT-560.**
 */
async function confirmChange(
  confirm: ReturnType<typeof useConfirm>,
  signedIn: boolean,
  onConfirm: () => void,
  onCancel: () => void,
) {
  /* Nothing to lose when signed out: there is no session for the change to
   * end, so the change is just a change. */
  if (!signedIn) {
    onConfirm();
    return;
  }

  const yes = await confirm({
    title: "Change the auth server?",
    message:
      "You will be signed out of your Gryt account. Your servers and your twenty-four words stay exactly as they are.",
    confirm: "Change and sign out",
  });
  if (yes) onConfirm();
  else onCancel();
}
