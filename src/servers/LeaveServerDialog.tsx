import { Button, Dialog, useTheme } from "@gryt/ui-native";
import { Text, View } from "react-native";

import { useShell } from "../shell/ShellContext";
import { useServers } from "./store";

/**
 * "Leave <server>?", asked once, from wherever it was asked.
 *
 * Mounted beside the tabs rather than inside the switcher or the header,
 * because both of those can ask and one of them is a drawer rendered through a
 * portal — a confirmation opened from inside it would be a modal inside a
 * modal.
 *
 * A `Dialog` rather than an `AlertDialog`, the same call the join confirmation
 * makes and for the same reason: an AlertDialog cannot be dismissed by tapping
 * outside, and here cancelling is the safe answer. The destructive tone is on
 * the button, which is where the warning belongs.
 *
 * Leaving the server you are looking at needs no special handling. The shell
 * picks the active server as `servers.find(...) ?? servers[0] ?? null`, so it
 * falls to the next one on its own, and the root layout already draws the
 * "no servers" screen when the list empties.
 */
export function LeaveServerDialog() {
  const theme = useTheme();
  const { leaving, setLeaving } = useShell();
  /* Read here, outside the dialog's own tree, for the reason in the README:
   * context does not cross the portal a popup is rendered through. */
  const { leave } = useServers();

  return (
    <Dialog.Root
      open={leaving !== null}
      onOpenChange={(open: boolean) => {
        if (!open) setLeaving(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Leave {leaving?.name}?</Dialog.Title>
          <Dialog.Description>
            It goes off your list. You will need an invite to come back, unless
            the server lets anyone join.
          </Dialog.Description>

          {/* The address, because the servers most likely to be left are the
              ones you cannot tell apart by name — two dev servers, or one that
              moved. */}
          <View style={{ paddingBottom: theme.space(2) }}>
            <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
              {leaving?.host}
            </Text>
          </View>

          <Dialog.Footer>
            <Button tone="ghost" onPress={() => setLeaving(null)}>
              Cancel
            </Button>
            <Button
              tone="danger"
              onPress={() => {
                if (leaving) void leave(leaving.host);
                setLeaving(null);
              }}
            >
              Leave
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
