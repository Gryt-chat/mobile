import { useMemo } from "react";
import { Image, Linking, View, type TextStyle } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import * as WebBrowser from "expo-web-browser";

import { GRYT_ITALICS } from "../ui/fonts";
import { useCustomEmojis } from "./CustomEmojiProvider";
import { resolveEmoji } from "./emoji";
import { applyMentions, flattenInline, parseMarkdown, type Block, type Inline } from "./markdown";

/**
 * A message, drawn from its markdown rather than as its markdown.
 *
 * The parse is in `markdown.ts` and everything here is layout. React Native has
 * three rules that shape all of it:
 *
 * A `View` cannot go inside a `Text`, so every block is a sibling `View` and
 * only the runs of words nest.
 *
 * **A face does not inherit.** `@gryt/ui-native`'s `Text` reads the weight off
 * *its own* style to choose a family, and a nested one has only what it was
 * given — so `<Text bold><Text italic>` resolves the inner face from nothing
 * and loses the bold. The inline tree is therefore flattened to runs, and each
 * run names the one face it wants rather than being nested and hoping the
 * platform composes them.
 *
 * **There is no synthetic italic.** Once a `fontFamily` names a static upright
 * face, `fontStyle: "italic"` is ignored — so emphasis has to name a real
 * italic file. See `GRYT_ITALICS`.
 */
export function MessageMarkdown({
  text,
  style,
  mentionable,
}: {
  text: string;
  /** The row's own type ramp. Colour, size and line height come from there. */
  style: TextStyle;
  /**
   * Nicknames that should light up when written with an `@`.
   *
   * Passed in rather than read from context, because the member list is not
   * reachable from everywhere a message is drawn — the catalogue draws one with
   * nobody at all — and an empty list is a correct answer rather than a
   * degraded one.
   */
  mentionable?: string[];
}) {
  const theme = useTheme();
  const blocks = useMemo(() => {
    const parsed = parseMarkdown(text);
    if (!mentionable?.length) return parsed;
    return parsed.map((block) => withMentions(block, mentionable));
  }, [text, mentionable]);

  return (
    <View style={{ gap: theme.space(2) }}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} style={style} />
      ))}
    </View>
  );
}

/** `applyMentions` reaches inlines; a block holds them in four different shapes. */
function withMentions(block: Block, nicknames: string[]): Block {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return { ...block, children: applyMentions(block.children, nicknames) };
    case "quote":
      return { ...block, children: block.children.map((child) => withMentions(child, nicknames)) };
    case "list":
      return { ...block, items: block.items.map((item) => applyMentions(item, nicknames)) };
    /* Not a fence. A name in a code block is code. */
    case "code":
      return block;
  }
}

function BlockView({ block, style }: { block: Block; style: TextStyle }) {
  const theme = useTheme();
  /* Quote rules and list markers are furniture rather than words, and stay in
   * the muted colour whatever the row's own is. */
  const dim = theme.color.muted;

  switch (block.type) {
    case "paragraph":
      return <Runs nodes={block.children} style={style} />;

    case "heading":
      /* Three sizes off the row's own, rather than a scale of their own. A
       * heading in a chat message is emphasis, not document structure, and one
       * that dwarfs the conversation around it reads as shouting. */
      return (
        <Runs
          nodes={block.children}
          style={{
            ...style,
            fontSize:
              (style.fontSize ?? 16) *
              (block.level === 1 ? 1.35 : block.level === 2 ? 1.2 : 1.08),
            lineHeight: (style.lineHeight ?? 22) * (block.level === 1 ? 1.3 : 1.18),
            fontWeight: "700",
          }}
        />
      );

    case "code":
      /**
       * Long lines wrap rather than scroll.
       *
       * A horizontal `ScrollView` is the nicer way to read a stack trace and it
       * would take the long-press with it: holding a message is how the actions
       * sheet opens, and a scroll view inside the row claims that gesture. A
       * wrapped line is worse to read than a scrolled one; a message you cannot
       * reply to is worse than both.
       */
      return (
        <View
          style={{
            backgroundColor: theme.color.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.border,
            paddingHorizontal: theme.space(3),
            paddingVertical: theme.space(2),
          }}
        >
          <Text
            mono
            style={{
              color: style.color,
              fontSize: (style.fontSize ?? 16) - 2,
              lineHeight: (style.fontSize ?? 16) * 1.4,
            }}
          >
            {block.value}
          </Text>
        </View>
      );

    case "quote":
      return (
        <View style={{ flexDirection: "row", gap: theme.space(2) }}>
          {/* A rule beside the block rather than a border on it, so it keeps
              its full height when what it holds is a fence with a background
              of its own. */}
          <View style={{ width: 3, borderRadius: 2, backgroundColor: dim }} />
          <View style={{ flex: 1, gap: theme.space(2) }}>
            {block.children.map((child, i) => (
              <BlockView key={i} block={child} style={{ ...style, color: dim }} />
            ))}
          </View>
        </View>
      );

    case "list":
      return (
        <View style={{ gap: theme.space(1) }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: theme.space(2) }}>
              {/* A fixed width so the words line up under each other rather
                  than stepping right when the count reaches ten. */}
              <Text style={{ ...style, color: dim, minWidth: block.ordered ? 22 : 12 }}>
                {block.ordered ? `${block.start + i}.` : "•"}
              </Text>
              <Runs nodes={item} style={{ ...style, flex: 1 }} />
            </View>
          ))}
        </View>
      );
  }
}

function Runs({ nodes, style }: { nodes: Inline[]; style: TextStyle }) {
  const theme = useTheme();
  const custom = useCustomEmojis();
  const runs = useMemo(() => flattenInline(nodes), [nodes]);

  return (
    <Text style={style}>
      {runs.map((run, i) => {
        const href = run.marks.href;
        const linked = href !== null && openable(href);

        if (run.shortcode) {
          const emoji = resolveEmoji(run.shortcode, custom);
          /* Nothing answers to the name, so it was never a shortcode: `9:30`,
             or the middle of `a:b:c`. The literal text goes back, which is
             what the desktop does with it too. */
          if (emoji?.kind === "unicode") {
            return (
              <Text key={i} style={{ fontSize: (style.fontSize ?? 16) * 1.15 }}>
                {emoji.character}
              </Text>
            );
          }
          if (emoji?.kind === "custom") {
            /* An `Image` inside a `Text` is laid out on the line by both
               platforms, and needs an explicit size to do it — there is no
               intrinsic one until the picture has loaded, and a zero-height
               line that grows afterwards reflows the whole list.

               `accessibilityLabel` is the name, so a screen reader says
               "shrug" rather than nothing at all. */
            const size = (style.fontSize ?? 16) * 1.35;
            return (
              <Image
                key={i}
                source={{ uri: emoji.url }}
                accessibilityLabel={`:${run.shortcode}:`}
                style={{ width: size, height: size }}
                resizeMode="contain"
              />
            );
          }
        }

        if (run.mention) {
          /* Tinted rather than a chip with a background. A background on a
             nested `Text` sits on the line box, so a mention mid-sentence
             would be a coloured block that does not line up with the words
             around it — and a mention is usually mid-sentence. */
          return (
            <Text
              key={i}
              style={{ color: theme.color.accent, fontWeight: "600" }}
            >
              {run.value}
            </Text>
          );
        }

        return (
          <Text
            key={i}
            mono={run.marks.code}
            accessibilityRole={linked ? "link" : undefined}
            onPress={linked ? () => void open(href) : undefined}
            style={{
              /* The weight is set as well as the face, so a theme with no
                 fonts loaded — a first frame, or a test — still draws bold as
                 bold rather than as nothing. */
              fontWeight: run.marks.strong ? "700" : style.fontWeight,
              ...(run.marks.em && !run.marks.code
                ? { fontFamily: run.marks.strong ? GRYT_ITALICS.bold : GRYT_ITALICS.regular }
                : null),
              ...(run.marks.strike ? { textDecorationLine: "line-through" as const } : null),
              /* No padding on a code run. A nested `Text` ignores it on Android
                 and shifts the line box on iOS, so the same message would sit
                 at two different heights on the two platforms. */
              ...(run.marks.code
                ? { backgroundColor: theme.color.surface, color: theme.color.text }
                : null),
              ...(linked ? { color: theme.color.accent } : null),
            }}
          >
            {run.value}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Which schemes are worth a tap.
 *
 * An allow-list rather than a block-list. `javascript:` is the one everybody
 * remembers and it is not the only one — `Linking.openURL` hands whatever it is
 * given to the platform, which will happily open a scheme some other installed
 * app registered. A message from a stranger is exactly the case this is for.
 *
 * A `mention:` target fails this, which is the right answer for now: it is the
 * server's own construct in a join announcement, and tapping a name should open
 * that person, which there is nothing yet to do. The run draws as its label.
 */
function openable(href: string): boolean {
  return /^(https?|mailto|tel|gryt):/i.test(href);
}

async function open(href: string) {
  try {
    if (/^https?:/i.test(href)) {
      /* In-app rather than out to Safari: a link in a message is usually
       * something to glance at, and coming back should not mean finding your
       * way back to the app. */
      await WebBrowser.openBrowserAsync(href);
      return;
    }
    if (await Linking.canOpenURL(href)) await Linking.openURL(href);
  } catch {
    /* Nothing to say. The platform refusing to open a link is not something
     * this app can fix, and a toast for it would be noise on a stray tap. */
  }
}
