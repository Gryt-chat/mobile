import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { FlagIcon } from "phosphor-react-native/src/icons/Flag";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { PushPinIcon } from "phosphor-react-native/src/icons/PushPin";
import { PushPinSlashIcon } from "phosphor-react-native/src/icons/PushPinSlash";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { TrashSimpleIcon } from "phosphor-react-native/src/icons/TrashSimple";

import { type MessageAbilities } from "./messageAbilities";
import { ReactionGlyph } from "./Reactions";
import { getFrequentReactions, recordReaction } from "./recentReactions";
import { useFoldPane } from "../shell/useFold";

export interface MessageActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  abilities: MessageAbilities;
  onReact: (src: string) => void;
  /** Opens the full emoji picker. Absent where the quick row is all there is. */
  onOpenPicker?: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  /** "Start thread" or "Open thread", after Reply as on the desktop. Absent where there is none. */
  thread?: { label: string; run: () => void };
  /** Pin or unpin. Absent where this person may not (GRYT-1619). */
  pin?: { pinned: boolean; run: () => void };
  /** Whose reactions to count, so the quick row is the four you use most there. */
  serverHost?: string;
  /** The held message, drawn lifted between the reactions and the actions (C03). */
  preview?: ReactNode;
  /** Where on the screen the message was held, so the menu opens beside it. */
  anchorY?: number;
}

/**
 * What you can do to a message, on a hold. **A `Drawer` rather than a `Sheet`**, whose
 * portal context does not cross. **Nothing here confirms** — a hold is already two acts.
 */
export function MessageActions({
  open,
  onOpenChange,
  abilities,
  onReact,
  onOpenPicker,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onReport,
  thread,
  pin,
  serverHost,
  preview,
  anchorY,
}: MessageActionsProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [quick, setQuick] = useState<string[]>([]);
  const pickerNext = useRef(false);

  // Read on open, so a reaction sent a moment ago already counts.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void getFrequentReactions(6, serverHost).then((list) => {
      if (live) setQuick(list);
    });
    return () => {
      live = false;
    };
  }, [open, serverHost]);

  const actions = [
    abilities.canReply && { key: "reply", label: "Reply", icon: ArrowBendUpLeftIcon, run: onReply },
    thread && { key: "thread", label: thread.label, icon: ChatsTeardropIcon, run: thread.run },
    abilities.canCopy && { key: "copy", label: "Copy text", icon: CopyIcon, run: onCopy },
    pin && {
      key: "pin",
      label: pin.pinned ? "Unpin" : "Pin",
      icon: pin.pinned ? PushPinSlashIcon : PushPinIcon,
      run: pin.run,
    },
    abilities.canEdit && { key: "edit", label: "Edit", icon: PencilSimpleIcon, run: onEdit },
    /* Above Delete rather than below: the two never appear together, and putting both
       last makes the bottom row the heavy one whichever message you held. */
    abilities.canReport && {
      key: "report",
      label: "Report",
      icon: FlagIcon,
      run: onReport,
      danger: true,
    },
    abilities.canDelete && {
      key: "delete",
      label: "Delete",
      icon: TrashSimpleIcon,
      run: onDelete,
      danger: true,
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: typeof CopyIcon;
    run: () => void;
    danger?: boolean;
  }[];

  // Opens beside the held message, kept on screen by a rough height of what it holds.
  const insets = useSafeAreaInsets();
  const close = () => onOpenChange(false);
  const pane = useFoldPane();
  const stack = (abilities.canReact ? 56 : 0) + (preview ? 120 : 0) + actions.length * 50 + 20;
  const top = Math.max(insets.top + 8, Math.min((anchorY ?? height / 3) - 90, height - insets.bottom - 8 - stack));

  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={close}
      onDismiss={() => {
        if (!pickerNext.current) return;
        pickerNext.current = false;
        onOpenPicker?.();
      }}
    >
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: "rgba(5, 6, 10, 0.62)" }} />
      <View pointerEvents="box-none" style={{ position: "absolute", left: (pane?.left ?? 0) + theme.space(4), right: theme.space(4), top, gap: 10 }}>
        {abilities.canReact ? (
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              padding: 4,
              borderRadius: 999,
              backgroundColor: theme.color.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            {quick.map((src) => (
              <Pressable
                key={src}
                onPress={() => {
                  onReact(src);
                  void recordReaction(src, serverHost);
                  close();
                }}
                accessibilityRole="button"
                accessibilityLabel={`React with ${src}`}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
                })}
              >
                <ReactionGlyph src={src} size={22} />
              </Pressable>
            ))}
            {onOpenPicker ? (
              <Pressable
                onPress={() => {
                  // iOS refuses a Modal while this one is still leaving and strands its backdrop, so wait for onDismiss.
                  if (Platform.OS === "ios") pickerNext.current = true;
                  close();
                  if (Platform.OS !== "ios") onOpenPicker();
                }}
                accessibilityRole="button"
                accessibilityLabel="More emoji"
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
                })}
              >
                <PlusIcon size={18} color={theme.color.text} weight="bold" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {preview ? (
          <View
            pointerEvents="none"
            style={{ padding: theme.space(3), borderRadius: 18, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border }}
          >
            {preview}
          </View>
        ) : null}

        <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.color.surfaceRaised, borderWidth: 1, borderColor: theme.color.border }}>
          {actions.map((action, i) => (
            <Pressable
              key={action.key}
              onPress={() => {
                /* Closed first, then run. Both put focus in the composer, and iOS
                 * drops a keyboard raised while a modal is still dismissing. */
                close();
                action.run();
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space(3),
                minHeight: 50,
                paddingHorizontal: theme.space(4),
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: theme.color.border,
                backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
              })}
            >
              <action.icon size={19} color={action.danger ? theme.color.danger : theme.color.muted} />
              <Text style={{ color: action.danger ? theme.color.danger : theme.color.text, fontSize: 16 }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
