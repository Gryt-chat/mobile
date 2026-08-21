import { useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Divider, Switch, useTheme } from "@gryt/ui-native";
import { BookOpenIcon } from "phosphor-react-native/src/icons/BookOpen";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";

import { usePreferences } from "./store";

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
 * **It is deliberately short, and the reason is worth reading before adding to
 * it.** The obvious contents are not reachable yet. Output volume, the noise
 * gate and automatic gain all need an audio graph a phone does not have —
 * `voiceConfigFrom` fills each of them in as a constant with a comment saying
 * so — and a slider that moves a number nothing reads is worse than no slider.
 * Notifications need push registration that exists neither here nor on the
 * server. "Join deafened" is the near miss: deafen itself did nothing on a
 * phone until GRYT-486, and it is a follow-up rather than a row here because
 * this app has to be on a released `@gryt/voice` that carries the fix.
 *
 * So what is here is one preference that is real, and the facts a bug report
 * needs. Two dead rows becoming one honest screen is the whole of it.
 */
export function PreferencesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences, ready, set } = usePreferences();

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
        <Group title="Voice">
          <SwitchRow
            label="Join muted"
            hint="Your microphone starts off when you join a channel"
            /* Disabled rather than defaulted while the stored value is still
               being read. A switch that draws itself off and then flicks on a
               moment later has told you something untrue about your own
               settings. */
            disabled={!ready}
            checked={preferences.joinMuted}
            onCheckedChange={(next) => set("joinMuted", next)}
          />
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
      <View
        style={{
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
          paddingHorizontal: theme.space(3),
        }}
      >
        {separated(children)}
      </View>
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

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        accessibilityLabel={label}
      />
    </View>
  );
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
