import { Pressable, useWindowDimensions, View } from "react-native";
import { Divider, Drawer, Text, useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";

import { QUICK_REACTIONS, type MessageAbilities } from "./messageAbilities";

export interface MessageActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  abilities: MessageAbilities;
  onReact: (src: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * What you can do to a message, on a hold.
 *
 * There was no way to touch a message at all before this — not one
 * `onLongPress` in the chat — so reply, react, copy, edit and delete were all
 * unreachable, including the two the app was already listening for the results
 * of.
 *
 * **A `Drawer` from the bottom rather than a `Sheet`.** The sheet renders
 * through `@gorhom/portal`, so context does not reach inside it and every value
 * has to be gathered in the caller's body first; the drawer is a React Native
 * `Modal`, which context crosses. It also covers the floating tab bar, which an
 * overlay drawn inside the screen would sit underneath.
 *
 * **Reactions first, then the actions.** Reacting is the common one by a wide
 * margin, and a row of faces at the top is reachable without moving your thumb
 * off the bottom of the screen. Delete is last and it is the only one in the
 * danger colour.
 */
export function MessageActions({
  open,
  onOpenChange,
  abilities,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
}: MessageActionsProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();

  const actions = [
    abilities.canReply && { key: "reply", label: "Reply", icon: ArrowBendUpLeftIcon, run: onReply },
    abilities.canCopy && { key: "copy", label: "Copy text", icon: CopyIcon, run: onCopy },
    abilities.canEdit && { key: "edit", label: "Edit", icon: PencilSimpleIcon, run: onEdit },
    abilities.canDelete && {
      key: "delete",
      label: "Delete",
      icon: TrashIcon,
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

  /* Measured rather than a fixed fraction. `Drawer.Popup` takes a share of the
   * screen, and the sheet's own height depends on which actions this message
   * offers — a fixed one leaves a band of empty panel under somebody else's
   * message, where edit and delete are missing. */
  const content =
    theme.space(3) + // grab
    (abilities.canReact ? 46 + theme.space(5) : 0) +
    actions.length * 48 +
    theme.space(8); // bottom inset and breathing room
  const size = Math.min(0.9, content / height);

  const close = () => onOpenChange(false);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={size}>
          <View style={{ paddingHorizontal: theme.space(3) }}>
            {abilities.canReact ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: theme.space(2),
                  }}
                >
                  {QUICK_REACTIONS.map((src) => (
                    <Pressable
                      key={src}
                      onPress={() => {
                        onReact(src);
                        close();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`React with ${src}`}
                      style={({ pressed }) => ({
                        width: 46,
                        height: 46,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: pressed
                          ? theme.color.surfaceHover
                          : theme.color.surface,
                        borderWidth: 1,
                        borderColor: theme.color.border,
                      })}
                    >
                      <Text style={{ fontSize: 22 }}>{src}</Text>
                    </Pressable>
                  ))}
                </View>
                <Divider />
              </>
            ) : null}

            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => {
                  /* Closed first, then run. Both `Edit` and `Reply` put focus in
                   * the composer, and iOS drops a keyboard raised while a modal
                   * is still dismissing. */
                  close();
                  action.run();
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.space(3),
                  height: 48,
                  paddingHorizontal: theme.space(2),
                  borderRadius: theme.radius.md,
                  backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
                })}
              >
                <action.icon
                  size={20}
                  color={action.danger ? theme.color.danger : theme.color.muted}
                />
                <Text
                  style={{
                    color: action.danger ? theme.color.danger : theme.color.text,
                    fontSize: 16,
                    fontWeight: "500",
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
