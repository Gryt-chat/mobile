import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { useMembers } from "../connection/MembersProvider";
import { confirmServerFriend, friendAction, useFriends, type FriendAction } from "../connection/friendsStore";
import type { ServerFriendPerson } from "../connection/friendList";

/**
 * Your friends on this server (GRYT-1471): requests, friends and sent requests.
 * Requests show even while it's closed, since they're waiting on you.
 */
export function FriendsSection({ host }: { host: string | null }) {
  const theme = useTheme();
  const friends = useFriends(host);
  const { byId } = useMembers();
  const [expanded, setExpanded] = useState(false);
  if (!host || !friends) return null;
  const Caret = expanded ? CaretDownIcon : CaretRightIcon;

  const act = (action: FriendAction, id: string) => () => friendAction(host, action, id);

  const person = (p: ServerFriendPerson, actions: ReactNode, note?: string) => (
    <View
      key={p.serverUserId}
      testID={`friend-row-${p.serverUserId}`}
      style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), paddingHorizontal: theme.space(4), paddingVertical: theme.space(1.5) }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15 }}>
          {byId.get(p.serverUserId)?.nickname || p.nickname || "Somebody"}
        </Text>
        {note ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>{note}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: theme.space(1) }}>{actions}</View>
    </View>
  );

  const label = (text: string) => (
    <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "600", paddingHorizontal: theme.space(4), paddingTop: theme.space(2) }}>
      {text}
    </Text>
  );

  const total = friends.friends.length;
  const waiting = friends.incoming.length;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={waiting > 0 ? `Friends, ${waiting} waiting` : `Friends, ${total}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          paddingLeft: theme.space(4),
          paddingRight: theme.space(2),
          paddingTop: theme.space(4),
          paddingBottom: theme.space(1),
          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
        })}
      >
        <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
          Friends
        </Text>
        <Text style={{ color: waiting > 0 ? theme.color.accent : theme.color.muted, fontSize: 12, fontWeight: waiting > 0 ? "700" : "400" }}>
          {waiting > 0 ? `${waiting} waiting` : total}
        </Text>
        <Caret size={10} color={theme.color.muted} />
      </Pressable>

      {waiting > 0 ? (
        <View>
          {label("Requests")}
          {friends.incoming.map((p) =>
            person(p, (
              <>
                <Button size="small" tone="primary" onPress={act("accept", p.serverUserId)}>Accept</Button>
                <Button size="small" tone="ghost" onPress={act("decline", p.serverUserId)}>Decline</Button>
              </>
            )),
          )}
        </View>
      ) : null}

      {expanded ? (
        <View>
          {total === 0 && friends.outgoing.length === 0 ? (
            <Text style={{ color: theme.color.muted, fontSize: 13, paddingHorizontal: theme.space(4), paddingVertical: theme.space(1) }}>
              No friends here yet. Hold somebody's name in the member list to add them.
            </Text>
          ) : null}
          {total > 0 ? label("Friends") : null}
          {friends.friends.map((p) =>
            person(
              p,
              <>
                {!p.confirmed ? (
                  <Button size="small" tone="primary" onPress={() => confirmServerFriend(host, p)}>Confirm</Button>
                ) : null}
                <Button size="small" tone="ghost" onPress={act("remove", p.serverUserId)}>Remove</Button>
              </>,
              p.confirmed ? undefined : "Not added on this phone. Confirm it if you know them.",
            ),
          )}
          {friends.outgoing.length > 0 ? label("Sent") : null}
          {friends.outgoing.map((p) =>
            person(p, <Button size="small" tone="ghost" onPress={act("cancel", p.serverUserId)}>Cancel</Button>),
          )}
          <Text style={{ color: theme.color.muted, fontSize: 13, paddingHorizontal: theme.space(4), paddingTop: theme.space(2) }}>
            Friends are per server, and your list stays on this phone.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
