import { useState } from "react";
import { ActionSheetIOS, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, TextField, useTheme } from "@gryt/ui-native";
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
 * **Two fields, saved together.** They are different services on different
 * hosts and neither can be derived from the other, but moving one without the
 * other is GRYT-156: a token from the new Keycloak posted to the old
 * certificate authority, refused with "no applicable key found in the JWKS",
 * which describes the symptom and names nothing. So the Save button will not
 * accept one on its own — it says which half is missing instead.
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
   * so it is refused at the button rather than reported later as a 401. */
  const halfSet = Boolean(next.issuer) !== Boolean(next.identityUrl);

  const apply = async (override: { issuer: string; identityUrl: string }) => {
    setIssuer(override.issuer);
    setIdentityUrl(override.identityUrl);
    await save(override);
  };

  const save = async (override: { issuer: string; identityUrl: string }) => {
    await setAuthOverride(override);
    /* Signed out, always. A session and an identity certificate issued by the
     * old server say nothing about the new one, and leaving them means the next
     * join presents an identity this Keycloak has never heard of. `signOut`
     * clears the certificate with the tokens. */
    await account.signOut();
    setSaved(true);
  };

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
          onPress={() => router.back()}
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
          Gryt&apos;s own. Changing either signs you out — a session from one
          server means nothing to another.
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
        />

        {halfSet ? (
          <Alert severity="warning">
            Set both, or neither. A token from one server posted to the
            other&apos;s identity service is refused with an error that does not
            say why.
          </Alert>
        ) : null}

        {saved ? (
          <Alert severity="success">
            Saved, and signed out. Sign in again from the You tab.
          </Alert>
        ) : null}

        <Button
          tone="primary"
          size="large"
          disabled={!changed || halfSet}
          onPress={() =>
            confirmChange(account.state.status === "signedIn", () =>
              void save({ issuer, identityUrl }),
            )
          }
        >
          Save
        </Button>

        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>
            PRESETS
          </Text>
          <Button
            tone="neutral"
            onPress={() =>
              confirmChange(account.state.status === "signedIn", () => void apply(LOCAL))
            }
          >
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
            onPress={() =>
              confirmChange(account.state.status === "signedIn", () =>
                void apply({ issuer: "", identityUrl: "" }),
              )
            }
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
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
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
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
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
 * reading, which is what makes the ones that matter stop working.
 *
 * An `ActionSheetIOS` rather than a Dialog, for the reason leaving a server
 * uses one: UIKit presents it, so it does not wait for anything else to finish
 * dismissing first.
 */
function confirmChange(signedIn: boolean, onConfirm: () => void) {
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
    },
  );
}
