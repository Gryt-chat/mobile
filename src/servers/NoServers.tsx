import { Text, View } from "react-native";
import { Button, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { PlanetIcon } from "phosphor-react-native/src/icons/Planet";

/**
 * What the app is before you have joined anything.
 *
 * There is no navbar decision to make here and no server colour to paint with,
 * so this is the whole screen rather than a state inside the Server tab: with
 * no servers, "Server" and "Search" have nothing to be about.
 *
 * Two actions, because there are two errands. "Add a server" is "I have an
 * address"; discovery is "show me what is here". This screen only offered the
 * first, and the second was unreachable from it: Discovery lives in the
 * switcher, the switcher opens from the server header, and the header is not
 * drawn when there are no servers to name. Somebody with no address to type
 * into the join sheet had nowhere to go.
 *
 * The discovery action does not read the network. `useLanServers` only runs
 * while the switcher, the join sheet or the Discovery page is up, because the
 * first browse is what asks iOS for local network access. This is the first
 * screen of a fresh install, where nobody has gone looking for a server yet.
 * So no count and no list here; tapping through starts the browser, and the
 * prompt lands on a page that explains itself.
 */
export function NoServers({
  onAdd,
  onDiscover,
}: {
  onAdd: () => void;
  /** Omitted where discovery cannot run: Android, or a build without the module. */
  onDiscover?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.space(8),
        gap: theme.space(4),
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: theme.radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <PlanetIcon size={40} color={theme.color.muted} weight="fill" />
      </View>

      <View style={{ gap: theme.space(2) }}>
        <Text
          style={{
            color: theme.color.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          No servers yet
        </Text>
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 16,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {onDiscover
            ? /* The old line ended on "if you already know it", which dead-ends
                 the reader who does not know one. That reader is who the second
                 button is for. */
              "Gryt servers are run by the people who use them. Join one with an invite or its address, or look at what is running on the network you are on."
            : "Gryt servers are run by the people who use them. Join one with an invite, or with its address if you already know it."}
        </Text>
      </View>

      {/* Both from `Button` rather than hand-rolled, which the primary used to
          be. Two stacked buttons have to agree on height, radius and press
          behaviour; the hand-rolled one had no press scale, no reduced-motion
          handling, and a font a point off the size the component uses. */}
      <View style={{ alignItems: "center", gap: theme.space(1) }}>
        <Button tone="primary" size="large" onPress={onAdd}>
          Add a server
        </Button>

        {onDiscover ? (
          <Button
            tone="ghost"
            size="large"
            onPress={onDiscover}
            startIcon={<BroadcastIcon size={18} color={theme.color.muted} />}
          >
            Look on this network
          </Button>
        ) : null}
      </View>
    </View>
  );
}
