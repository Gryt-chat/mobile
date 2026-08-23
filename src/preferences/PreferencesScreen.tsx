import { useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Divider, Surface, Text, useTheme,
  Switch,
} from "@gryt/ui-native";
import { BookOpenIcon } from "phosphor-react-native/src/icons/BookOpen";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";

import { authOverride } from "../account/config";
import { isDefault } from "../account/authServer";
import { MESSAGE_LAYOUTS, useAppearance } from "./appearance";

const DOCS = "https://docs.gryt.chat";
const SOURCE = "https://github.com/Gryt-chat/mobile";

/**
 * Preferences, reached from the switcher and from Settings on the You page.
 *
 * Both of those rows had no `onPress` and both wanted the same screen, which is
 * what GRYT-481 is. A route rather than a sheet: it is a destination you go to
 * and come back from, not something raised over what you were doing, and being
 * an ordinary screen means the hooks are just called rather than drilled
 * through `@gorhom/portal`.
 *
 * **There is one preference on it now, and it took a while to find one.** Every
 * earlier candidate turned out to be something else on inspection.
 *
 * Output volume, the noise gate and automatic gain all need an audio graph a
 * phone does not have — `voiceConfigFrom` fills each of them in as a constant
 * with a comment saying so — and a slider that moves a number nothing reads is
 * worse than no slider. Notifications need push registration that exists
 * neither here nor on the server.
 *
 * Mute and deafen looked like the two easy ones, as "join muted" and "join
 * deafened". They are not preferences at all: they are things you do during a
 * call and stop doing when it ends, so hanging up clears both and every call
 * starts with them off. A setting for it would make the ordinary case the one
 * you have to remember to undo. `ShellContext` has the whole of that.
 *
 * Appearance is the one that cleared the bar, and it cleared it differently: it
 * is not asking the engine for anything. Both message layouts draw the same
 * messages from the same state, so the only question is which one somebody
 * prefers — which is what a preference is for. Anything added later still has
 * to clear the original bar: check that something reads it before drawing a
 * control for it.
 *
 * **Advanced is the exception and clears that bar.** The auth server is read —
 * by `useAccount` on every sign-in and by `getAccountCertificate` on every join
 * — and pointing it somewhere else is the difference between being able to test
 * against a local Keycloak and needing a real account for every run. GRYT-505.
 */
export function PreferencesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/* The same hand-rolled header the identity screen has, for the same
          reason: the root Stack runs with `headerShown: false` so that a screen
          owns its own top. */}
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
          Preferences
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}
      >
        {/* First, because it is the only thing on this page anybody changes
            more than once. */}
        <Group title="Appearance">
          <LayoutPicker />
        </Group>

        {/* After Appearance, because it is the other thing about how the app
            behaves rather than about a server or an account. */}
        <Group title="Sounds">
          <SoundsRow />
        </Group>

        {/* Advanced, and above About because About is the end of the page. One
            row, and the screen behind it is where the warnings are — this is
            not a setting to explain in a hint. */}
        <Group title="Advanced">
          <AuthServerRow />
        </Group>

        <Group title="About">
          <BuildRow />
          <LinkRow
            icon={<BookOpenIcon size={22} color={theme.color.text} weight="fill" />}
            label="Documentation"
            hint="docs.gryt.chat"
            url={DOCS}
          />
          <LinkRow
            icon={<CodeIcon size={22} color={theme.color.text} weight="fill" />}
            label="Source"
            hint="AGPL-3.0, on GitHub"
            url={SOURCE}
          />
        </Group>
      </ScrollView>
    </View>
  );
}

/**
 * How messages are drawn.
 *
 * A list of rows rather than a `Select` or a segmented control, because each
 * option needs a sentence explaining it and neither of those has room for one.
 * The chosen one carries a filled check; nothing else changes, so the list does
 * not jump as you move between them.
 *
 * No Save button, and no confirmation. It takes effect on the next frame and is
 * reversed by tapping the other one — settings in this app commit when they are
 * changed, and a dialog for something this cheap to undo would be noise.
 */
function LayoutPicker() {
  const theme = useTheme();
  const { messageLayout, setMessageLayout } = useAppearance();

  return (
    <>
      {MESSAGE_LAYOUTS.map((option) => {
        const chosen = option.value === messageLayout;

        return (
          <Pressable
            key={option.value}
            onPress={() => setMessageLayout(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={`${option.label}. ${option.hint}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(3),
              paddingVertical: theme.space(3),
              backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
            })}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: theme.color.text,
                  fontSize: 16,
                  fontWeight: chosen ? "600" : "500",
                }}
              >
                {option.label}
              </Text>
              <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
                {option.hint}
              </Text>
            </View>
            {chosen ? (
              <CheckCircleIcon size={22} color={theme.color.accent} weight="fill" />
            ) : (
              /* An empty box the size of the check, so the two rows are the
                 same width of content and the text does not shift when the
                 choice moves. */
              <View style={{ width: 22 }} />
            )}
          </Pressable>
        );
      })}
    </>
  );
}

/**
 * Which Keycloak this phone signs in to.
 *
 * The hint is the current value rather than a description, because the only
 * question anybody has here is "what is it set to now" — and "Gryt" is a
 * better answer for the default than the full issuer URL, which is long and
 * says nothing a name does not.
 */
/**
 * One switch for all three sounds.
 *
 * Not three, which is what the desktop has: it offers a file and a volume per
 * sound, and that is a page. On a phone the honest question is whether Gryt
 * makes a noise, and the phone's own volume and silent switch answer the rest.
 */
function SoundsRow() {
  const theme = useTheme();
  const { sounds, setSounds } = useAppearance();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(3),
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          Play sounds
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
          A message arriving, and somebody joining or leaving a call. Silent when
          the phone is.
        </Text>
      </View>
      <Switch checked={sounds} onCheckedChange={setSounds} />
    </View>
  );
}

function AuthServerRow() {
  const theme = useTheme();
  const override = authOverride();

  return (
    <Pressable
      onPress={() => router.push("/auth-server")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <ShieldCheckIcon size={22} color={theme.color.text} weight="fill" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          Auth server
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
          {isDefault(override) ? "Gryt" : (override.issuer ?? override.identityUrl)}
        </Text>
      </View>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/**
 * Which build this is, and a way to put it in a bug report.
 *
 * `Constants.platform.ios.buildNumber` rather than the one in `expoConfig`,
 * and the difference matters here specifically: the config's value is whatever
 * `app.json` says *now*, which is already the next build, while this is the
 * `CFBundleVersion` baked into the binary somebody is actually running. A
 * tester reporting "build 5" when they are on 4 is worse than not asking.
 *
 * Tapping copies the whole line rather than opening anything, because the only
 * thing anybody wants from this row is to paste it somewhere.
 */
function BuildRow() {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const version = Constants.expoConfig?.version ?? "unknown";
  const build = Constants.platform?.ios?.buildNumber ?? null;
  const label = build ? `${version} (${build})` : version;
  /* `Platform.OS` is the lowercase "ios", which reads as a typo next to a
     version number. Named rather than capitalised, because "Ios" would be
     worse than either. */
  const os =
    Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS;
  const details = `Gryt ${label} · ${os} ${Platform.Version}`;

  return (
    <Pressable
      onPress={() => {
        void Clipboard.setStringAsync(details);
        setCopied(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Copy build details: ${details}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      {copied ? (
        <CheckIcon size={22} color={theme.color.success} weight="bold" />
      ) : (
        <CopyIcon size={22} color={theme.color.text} weight="fill" />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          {copied ? "Copied" : "Version"}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>{details}</Text>
      </View>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space(1) }}>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          paddingBottom: theme.space(1),
        }}
      >
        {title}
      </Text>
      <Surface bordered radius="lg" style={{ paddingHorizontal: theme.space(3) }}>
        {separated(children)}
      </Surface>
    </View>
  );
}

/**
 * A hairline between rows and not after the last one.
 *
 * Written out rather than given to each row, so a row does not have to know
 * whether it is last — which is the thing that goes wrong when a row becomes
 * conditional.
 */
function separated(children: ReactNode): ReactNode {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];

  return items.map((child, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <View key={index}>
      {index > 0 ? <Divider /> : null}
      {child}
    </View>
  ));
}

function LinkRow({
  icon,
  label,
  hint,
  url,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  url: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      accessibilityRole="link"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>{hint}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
