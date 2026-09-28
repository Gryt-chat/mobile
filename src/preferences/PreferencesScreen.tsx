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
import { BellIcon } from "phosphor-react-native/src/icons/Bell";
import { BookOpenIcon } from "phosphor-react-native/src/icons/BookOpen";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { CompassIcon } from "phosphor-react-native/src/icons/Compass";
import { FileTextIcon } from "phosphor-react-native/src/icons/FileText";
import { GlobeIcon } from "phosphor-react-native/src/icons/Globe";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { DevicesIcon } from "phosphor-react-native/src/icons/Devices";
import { PaletteIcon } from "phosphor-react-native/src/icons/Palette";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";

import { authOverride } from "../account/config";
import { isDefault } from "../account/authServer";
import { resetTour } from "../onboarding/tourState";
import { LinkDeviceRow } from "../pairing/LinkDeviceRow";
import { PushToTalkRow } from "../voice/PushToTalkRow";
import { ChoiceRow } from "./ChoiceRow";
import { MESSAGE_LAYOUTS, useAppearance } from "./appearance";
import { APPEARANCE_OPTIONS } from "./appearanceChoice";
import { themeName } from "./appearanceTheme";

const SITE = "https://gryt.chat";
const DOCS = "https://docs.gryt.chat";
const SOURCE = "https://github.com/Gryt-chat/mobile";
/* Both stores expect these reachable from inside the app, and Apple asks for the
   terms by name in guideline 1.2 (GRYT-829). */
const TERMS = "https://gryt.chat/terms";
const PRIVACY = "https://gryt.chat/privacy";
const LICENSE = "https://github.com/Gryt-chat/mobile/blob/main/LICENSE";

/**
 * Preferences, reached from the switcher and from Settings. Check something reads a
 * value before drawing a control: a slider nothing reads is worse than none (GRYT-481).
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

        <Group title="Theme">
          <ThemeRow />
        </Group>

        <Group title="Messages">
          <LayoutPicker />
        </Group>

        {/* Before Privacy, in the desktop's order. Its own screen, since it's a
            list per server. */}
        <Group title="Security">
          <DevicesRow />
          <LinkDeviceRow />
        </Group>

        {/* Privacy and Notifications are their own screens, not groups here —
            each carries a default plus a per-server list, which is too much
            for a row on this page to draw (GRYT-1534). */}
        <Group title="Privacy & notifications">
          <PrivacyRow />
          <NotificationsRow />
        </Group>

        {/* After Appearance, because it is the other thing about how the app
            behaves rather than about a server or an account. */}
        <Group title="Sounds">
          <SoundsRow />
        </Group>

        {/* The mic test leads: this is the page people open when they can't
            be heard. Push to talk follows, as on the desktop's Audio page. */}
        <Group title="Voice">
          <MicTestRow />
          <PushToTalkRow />
        </Group>

        <Group title="Help">
          <ShowTourRow />
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
            icon={<GlobeIcon size={22} color={theme.color.text} weight="fill" />}
            label="Gryt.chat"
            hint="The site"
            url={SITE}
          />
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

        {/* The licence, under About rather than inside it: it's what you're
            already bound by rather than something to do, same as the desktop
            puts it below its own row of buttons. */}
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(LICENSE)}>
          <Text style={{ color: theme.color.muted, fontSize: 12, textAlign: "center" }}>
            © 2022–2026 Sivert Gullberg Hansen · AGPL-3.0-or-later
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Light, dark, or the phone's own answer. A list of rows rather than a segmented
 * control, because each option needs a sentence. Changing it repaints under the finger.
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
 * How messages are drawn. A list of rows, because each option needs a sentence. No
 * Save and no confirmation: settings here commit when they are changed.
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
 * Opens the full Privacy screen: who can message and call you, by default and per
 * server, plus what has been held back (GRYT-1534). Too much for a row on this page.
 */
function PrivacyRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push("/privacy")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <LockIcon size={22} color={theme.color.text} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>
        Privacy
      </Text>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/** Opens Your devices: each server's encrypted-DM devices, and removing one (GRYT-1526). */
function DevicesRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push("/devices")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <DevicesIcon size={22} color={theme.color.text} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>
        Your devices
      </Text>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/**
 * Opens the full Notifications screen: how loud each server is, by default and on
 * its own (GRYT-1534).
 */
function NotificationsRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push("/notification-settings")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <BellIcon size={22} color={theme.color.text} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>
        Notifications
      </Text>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/**
 * One switch for all three sounds, not three. On a phone the honest question is
 * whether Gryt makes a noise; the silent switch answers the rest.
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

/**
 * Opens the microphone test. A row rather than a control: it answers whether the phone
 * hears you and whether what it hears leaves the phone.
 */
function MicTestRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push("/mic-test")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <MicrophoneIcon size={22} color={theme.color.text} weight="fill" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          Microphone test
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
          Check the phone hears you, without joining a call
        </Text>
      </View>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/** Opens the palette picker. The hint is the one in use, same reasoning as AuthServerRow. */
function ThemeRow() {
  const theme = useTheme();
  const { activeThemeId, customThemes } = useAppearance();

  return (
    <Pressable
      onPress={() => router.push("/appearance-theme")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <PaletteIcon size={22} color={theme.color.text} weight="fill" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          Palette
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
          {themeName(activeThemeId, customThemes)}
        </Text>
      </View>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

/** Replays the onboarding tour on the spot, whether or not it has been seen. */
function ShowTourRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={resetTour}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <CompassIcon size={22} color={theme.color.text} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>
        Show the tour again
      </Text>
    </Pressable>
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
 * Which build this is, and a way to put it in a bug report. `Constants.platform`
 * rather than `expoConfig`, whose value is already the *next* build. Tapping copies.
 */
function BuildRow() {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const version = Constants.expoConfig?.version ?? "unknown";
  const build = Constants.platform?.ios?.buildNumber ?? null;
  const label = build ? `${version} (${build})` : version;
  /* `Platform.OS` is the lowercase "ios", which reads as a typo next to a version
     number. Named rather than capitalised, because "Ios" would be worse. */
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
 * A hairline between rows and not after the last one. Written out rather than given to
 * each row, so a row does not have to know whether it is last.
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
