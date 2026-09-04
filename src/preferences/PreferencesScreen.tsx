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
import { FileTextIcon } from "phosphor-react-native/src/icons/FileText";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";

import { authOverride } from "../account/config";
import { isDefault } from "../account/authServer";
import { MESSAGE_LAYOUTS, useAppearance } from "./appearance";
import { APPEARANCE_OPTIONS } from "./appearanceChoice";

const DOCS = "https://docs.gryt.chat";
const SOURCE = "https://github.com/Gryt-chat/mobile";
/* Both stores expect these to be reachable from inside the app rather than
   only from the store listing, and Apple asks for the terms by name in
   guideline 1.2 for anything carrying what people write. GRYT-829. */
const TERMS = "https://gryt.chat/terms";
const PRIVACY = "https://gryt.chat/privacy";

/**
 * Preferences, reached from the switcher and from Settings on the You page
 * (GRYT-481). A route rather than a sheet, so the hooks are just called rather
 * than drilled through `@gorhom/portal`.
 *
 * **The bar for adding one: check that something reads it before drawing a
 * control for it.** Output volume, the noise gate and automatic gain all need
 * an audio graph a phone does not have — `voiceConfigFrom` fills each in as a
 * constant — and a slider that moves a number nothing reads is worse than no
 * slider. Notifications need push registration that exists on neither side.
 *
 * Mute and deafen are not preferences: hanging up clears both, so a "join
 * muted" setting makes the ordinary case the one you remember to undo.
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
        {/* First, and its own group rather than sharing one with the message
            layout. Both are appearance in the loose sense, but five rows under
            one heading is a list where the divider in the middle is the only
            thing saying the top three and the bottom two are different
            questions. */}
        <Group title="Appearance">
          <AppearancePicker />
        </Group>

        <Group title="Messages">
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
          {/* Under About rather than in a group of their own. Two rows nobody
              opens twice, next to the other two links that go to a browser. */}
          <LinkRow
            icon={<FileTextIcon size={22} color={theme.color.text} weight="fill" />}
            label="Terms of use"
            hint="gryt.chat/terms"
            url={TERMS}
          />
          <LinkRow
            icon={<LockIcon size={22} color={theme.color.text} weight="fill" />}
            label="Privacy policy"
            hint="gryt.chat/privacy"
            url={PRIVACY}
          />
        </Group>
      </ScrollView>
    </View>
  );
}

/**
 * Light, dark, or the phone's own answer.
 *
 * The same three the desktop offers and in the same order, System first and
 * default. "System" needs a sentence to say what it follows, and both of the
 * others need one to say that they do not — which is why this is a list of
 * rows rather than a segmented control, the same reasoning as the layouts
 * below.
 *
 * Changing it repaints under the finger. That is the confirmation: there is
 * nothing to explain about a setting whose effect is the screen you are
 * looking at.
 */
function AppearancePicker() {
  const { appearance, setAppearance } = useAppearance();

  return (
    <>
      {APPEARANCE_OPTIONS.map((option) => (
        <ChoiceRow
          key={option.value}
          label={option.label}
          hint={option.hint}
          chosen={option.value === appearance}
          onPress={() => setAppearance(option.value)}
        />
      ))}
    </>
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
  const { messageLayout, setMessageLayout } = useAppearance();

  return (
    <>
      {MESSAGE_LAYOUTS.map((option) => (
        <ChoiceRow
          key={option.value}
          label={option.label}
          hint={option.hint}
          chosen={option.value === messageLayout}
          onPress={() => setMessageLayout(option.value)}
        />
      ))}
    </>
  );
}

/**
 * One option in a list of them.
 *
 * Written once and used by both pickers on this page. The two were the same row
 * with a different `option` before the appearance one existed, and copying it
 * would have made the second copy the one that goes stale.
 */
function ChoiceRow({
  label,
  hint,
  chosen,
  onPress,
}: {
  label: string;
  hint: string;
  chosen: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={`${label}. ${hint}`}
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
          style={{ color: theme.color.text, fontSize: 16, fontWeight: chosen ? "600" : "500" }}
        >
          {label}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
      </View>
      {chosen ? (
        <CheckCircleIcon size={22} color={theme.color.accent} weight="fill" />
      ) : (
        /* An empty box the size of the check, so every row is the same width of
           content and the text does not shift when the choice moves. */
        <View style={{ width: 22 }} />
      )}
    </Pressable>
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
