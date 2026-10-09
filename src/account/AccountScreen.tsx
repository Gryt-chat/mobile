import { useState } from "react";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { EnvelopeIcon } from "phosphor-react-native/src/icons/Envelope";
import { KeyIcon } from "phosphor-react-native/src/icons/Key";
import { LifebuoyIcon } from "phosphor-react-native/src/icons/Lifebuoy";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";

import { useGrytAccount } from "./AccountProvider";
import { ACCOUNT_ACTIONS } from "./accountActions";
import { maskEmail } from "./maskEmail";
import { useConfirm } from "../ui/actionSheet";
import { MenuGroup, MenuRow } from "../ui/MenuGroup";
import { PageHeader } from "../ui/PageHeader";

/**
 * Your Gryt account, one tap in from the You page (GRYT-1709). Everything that changes or
 * ends the account lives here, and the email stays masked until you ask for it.
 */
export function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const confirm = useConfirm();
  const { state, signOut, runAccountAction } = useGrytAccount();
  const [shown, setShown] = useState(false);

  if (state.status !== "signedIn") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        <PageHeader title="Gryt account" />
        <Text style={{ color: theme.color.muted, padding: theme.space(4) }}>
          {state.status === "loading" ? "Checking…" : "You're not signed in."}
        </Text>
      </View>
    );
  }

  const { profile } = state;
  // Without an email the label is a username, which is fine to show as it is.
  const who = profile.email ? (shown ? profile.email : maskEmail(profile.email)) : profile.label;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <PageHeader title="Gryt account" />
      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5), paddingBottom: insets.bottom + theme.space(6) }}
      >
        <MenuGroup>
          <MenuRow
            icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
            label={who}
            hint="Signed in as"
            trailing={
              profile.email ? (
                <Button
                  size="small"
                  tone="neutral"
                  onPress={() => setShown((s) => !s)}
                  accessibilityLabel={shown ? "Hide your email" : "Show your email"}
                >
                  {shown ? "Hide" : "Show"}
                </Button>
              ) : undefined
            }
          />
        </MenuGroup>

        {/* These open the browser at the auth server's own themed pages and come back. */}
        <MenuGroup title="Sign-in">
          <MenuRow
            icon={<LockIcon size={22} color={theme.color.muted} weight="fill" />}
            label="Change password"
            onPress={() => void runAccountAction(ACCOUNT_ACTIONS.password)}
          />
          <MenuRow
            icon={<EnvelopeIcon size={22} color={theme.color.muted} weight="fill" />}
            label="Change email"
            onPress={() => void runAccountAction(ACCOUNT_ACTIONS.email)}
          />
        </MenuGroup>

        <MenuGroup title="Getting back in">
          <MenuRow
            icon={<KeyIcon size={22} color={theme.color.muted} weight="fill" />}
            label="Your twenty-four words"
            hint="Used on servers that don't take Gryt accounts"
            onPress={() => router.push("/identity")}
          />
          <MenuRow
            icon={<LifebuoyIcon size={22} color={theme.color.muted} weight="fill" />}
            label="Recovery codes"
            hint="For when you lose your authenticator"
            onPress={() => void runAccountAction(ACCOUNT_ACTIONS.recoveryCodes)}
          />
        </MenuGroup>

        <MenuGroup>
          <MenuRow
            icon={<SignOutIcon size={22} color={theme.color.danger} weight="bold" />}
            label="Sign out"
            tone="danger"
            onPress={() =>
              void confirmSignOut(confirm, who, () => {
                router.back();
                void signOut();
              })
            }
          />
          {/* The only one that asks first: the browser takes a beat to open, long enough
              to wonder what you just tapped. */}
          <MenuRow
            icon={<TrashIcon size={22} color={theme.color.danger} weight="fill" />}
            label="Delete account"
            tone="danger"
            onPress={() => void confirmDeleteAccount(confirm, () => void runAccountAction(ACCOUNT_ACTIONS.deleteAccount))}
          />
        </MenuGroup>
      </ScrollView>
    </View>
  );
}

/** Keycloak asks again, so this answers "what did I just tap" and says what deletion doesn't reach. */
async function confirmDeleteAccount(confirm: ReturnType<typeof useConfirm>, onDelete: () => void) {
  const ok = await confirm({
    title: "Delete your Gryt account?",
    message:
      "You will be asked again in the browser. Deleting removes your Gryt account and cannot be undone. Messages you have already sent stay on the servers that received them.",
    confirm: "Continue",
  });
  if (ok) onDelete();
}

async function confirmSignOut(confirm: ReturnType<typeof useConfirm>, who: string, onSignOut: () => void) {
  const yes = await confirm({
    title: "Sign out of Gryt?",
    message: `${who}\n\nYour servers and your twenty-four words stay exactly as they are. Only the account goes.`,
    confirm: "Sign out",
  });
  if (yes) onSignOut();
}
