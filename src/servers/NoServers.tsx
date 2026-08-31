import { View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { LinkSimpleIcon } from "phosphor-react-native/src/icons/LinkSimple";
import { PlanetIcon } from "phosphor-react-native/src/icons/Planet";

import { useWideScreen } from "../shell/twoPane";

/**
 * What the app is before you have joined anything.
 *
 * There is no navbar decision to make here and no server colour to paint with,
 * so this is the whole screen rather than a state inside the Server tab: with
 * no servers, "Server" and "Search" have nothing to be about.
 *
 * **Two actions, because there are two errands.** "Add a server" is "I have an
 * address"; discovery is "show me what is here". This screen only offered the
 * first, and the second was unreachable from it: Discovery lives in the
 * switcher, the switcher opens from the server header, and the header is not
 * drawn when there are no servers to name. So the one person who has nothing
 * to type into the join sheet was the one person who could not go looking.
 *
 * The discovery action does not read the network. `useLanServers` only runs
 * while the switcher, the join sheet or the Discovery page is up, because the
 * first browse is what asks iOS for local network access — and this is the
 * first screen of a fresh install, which is the moment that question makes
 * least sense. So no count and no list here; tapping through is what starts
 * the browser, and the prompt lands on a page that explains itself.
 */
export function NoServers({
  onAdd,
  onDiscover,
}: {
  onAdd: () => void;
  /** Omitted where discovery cannot run — Android, or a build without the module. */
  onDiscover?: () => void;
}) {
  const theme = useTheme();
  const wide = useWideScreen();

  if (wide) return <NoServersWide onAdd={onAdd} onDiscover={onDiscover} />;

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
            ? /* The old line ended on "if you already know it", which closes the
                 door on the person who does not know one — who is most of the
                 people reading it, and exactly who the second button is for. */
              "Gryt servers are run by the people who use them. Join one with an invite or its address, or look at what is running on the network you are on."
            : "Gryt servers are run by the people who use them. Join one with an invite, or with its address if you already know it."}
        </Text>
      </View>

      {/* Both from `Button` rather than hand-rolled, which the primary used to
          be. Two buttons stacked have to agree on height, radius and press
          behaviour, and the version of that written here agreed with nothing —
          no press scale, no reduced-motion handling, and a font a point off the
          size the component uses. */}
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

/**
 * The same screen with room to work in.
 *
 * The phone version is a column: a mark, a title, a paragraph, and the two
 * actions stacked as buttons under it. Stretched across 1280 points that reads
 * as a small clump adrift in a dark field, and the paragraph runs one line so
 * long the eye loses the start of it.
 *
 * So the width carries the decision instead of the paragraph. There are exactly
 * two errands and the phone copy already names them — one is "I have an
 * address", the other is "show me what is here" — and side by side they stop
 * being a primary action with an afterthought under it and become two doors
 * with the same standing. The long sentence splits in half at the same time,
 * because each door only has to explain itself.
 *
 * **Nothing here knows anything.** No count, no list, no "servers nearby". This
 * screen deliberately does not browse: the first browse is what asks iOS for
 * local network access, and the first launch of a fresh install is the worst
 * moment to spring that. The second door says what it will do, not what it
 * found.
 */
function NoServersWide({
  onAdd,
  onDiscover,
}: {
  onAdd: () => void;
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
        padding: theme.space(10),
      }}
    >
      {/* Capped and centred rather than filling the screen. The cap is what
          keeps the sentence under it to a readable measure — the whole problem
          with the phone layout up here is a line nobody can track back to. */}
      <View style={{ width: "100%", maxWidth: 760, alignItems: "center" }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surfaceRaised,
          }}
        >
          <PlanetIcon size={44} color={theme.color.muted} weight="fill" />
        </View>

        <Text
          style={{
            marginTop: theme.space(6),
            color: theme.color.text,
            fontSize: 32,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          No servers yet
        </Text>

        {/* One sentence, not two. The second half of the phone's paragraph is
            what the two panels below say for themselves, and saying it twice
            was most of why that paragraph was so long. */}
        <Text
          style={{
            marginTop: theme.space(2),
            color: theme.color.muted,
            fontSize: 17,
            lineHeight: 24,
            textAlign: "center",
          }}
        >
          Gryt servers are run by the people who use them.
        </Text>

        {/* `stretch` so both panels are as tall as the taller one. Left to
            themselves they size to their own text, and two cards of different
            heights side by side read as one of them being unfinished. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: "center",
            gap: theme.space(4),
            marginTop: theme.space(8),
            width: "100%",
          }}
        >
          <Door
            icon={<LinkSimpleIcon size={22} color={theme.color.accent} weight="bold" />}
            title="Join with an invite"
            body="Paste the link, or type the address of a server you already know."
            action={
              <Button tone="primary" size="large" onPress={onAdd}>
                Add a server
              </Button>
            }
            /* Alone, it sits at its own width instead of spreading over the
               whole cap — a single panel stretched to 760 is a banner, and a
               banner with one button in it looks like a mistake. */
            solo={!onDiscover}
          />

          {onDiscover ? (
            <Door
              icon={<BroadcastIcon size={22} color={theme.color.muted} weight="bold" />}
              title="Or see what is around"
              body="Check the network you are on for servers other people are running."
              action={
                <Button tone="ghost" size="large" onPress={onDiscover}>
                  Look on this network
                </Button>
              }
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** One of the two errands: an icon, what it is, and the button that does it. */
function Door({
  icon,
  title,
  body,
  action,
  solo = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
  solo?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: solo ? 0 : 1,
        width: solo ? 360 : undefined,
        padding: theme.space(5),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
        gap: theme.space(3),
      }}
    >
      {icon}
      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
        {title}
      </Text>
      {/* No `flex` on this, and that is the second attempt. `flex: 1` here was
          meant to take up the slack so the two buttons sat level, and it
          collapsed the sentence to nothing instead — on the Text and then again
          on a View wrapping it. A panel is sized by its content, so "the
          remaining space" is zero at the point the child asks for it, and both
          panels rendered as a title above a button with the middle missing.
          The two sentences are a line apart in length; letting them size
          themselves costs a few points of button misalignment and keeps the
          words. */}
      <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
        {body}
      </Text>
      <View style={{ marginTop: theme.space(1) }}>{action}</View>
    </View>
  );
}
