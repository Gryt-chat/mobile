/** Fake DMs, friends and presence to check the Messages tab against the boards (GRYT-1747).
 * Dev only: `EXPO_PUBLIC_FAKE_DMS=1 yarn start`; the desktop's `?fakedms` people. */
import type { ConversationEntry } from "../connection/AllConversationsProvider";
import type { DirectConversation } from "../connection/directMessages";
import type { HostFriends } from "../connection/friendsStore";
import type { Status } from "../shell/data";

export const fakeDmsOn: boolean = __DEV__ && process.env.EXPO_PUBLIC_FAKE_DMS === "1";

const id = (name: string) => `fake-${name.toLowerCase()}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Who is in what state, as the boards draw them. */
const STATUS: Record<string, Status> = {
  Al: "in_voice",
  Justin: "online",
  Ingrid: "in_voice",
  Maja: "in_voice",
  Carlo: "afk",
  Mira: "offline",
  Ole: "offline",
  Sindre: "online",
  Eirik: "online",
};

export function fakeStatus(serverUserId: string): Status | undefined {
  const name = Object.keys(STATUS).find((n) => id(n) === serverUserId);
  return name ? STATUS[name] : undefined;
}

const participant = (name: string) => ({ server_user_id: id(name), nickname: name, avatar_file_id: null, avatar_worn: null });

const dm = (name: string, minutes: number): DirectConversation =>
  ({
    conversation_id: `fake-dm-${name.toLowerCase()}`,
    kind: "dm",
    name: null,
    icon_file_id: null,
    created_at: minutesAgo(60 * 24 * 30),
    last_message_at: minutesAgo(minutes),
    members: [participant(name)],
    other: participant(name),
  }) as DirectConversation;

/** Every fake row sits on the active server, so its presence dots show. */
export function fakeConversations(host: string): ConversationEntry[] {
  const group = {
    ...dm("Al", 47),
    conversation_id: "fake-group-saturday-raid",
    kind: "group",
    name: "Saturday raid",
    members: [participant("Al"), participant("Justin"), participant("Carlo")],
  } as DirectConversation;
  return [dm("Al", 3), dm("Carlo", 2), group, dm("Mira", 60 * 24 * 2), dm("Ole", 60 * 24 * 7)]
    .sort((a, b) => Date.parse(b.last_message_at ?? "") - Date.parse(a.last_message_at ?? ""))
    .map((conversation) => ({ host, conversation }));
}

export const FAKE_PREVIEWS: Record<string, string> = {
  "fake-dm-al": "You: deal, Haz 5 at 20:00 then",
  "fake-dm-carlo": "Did you see the Flathub reply? I think we just need the metainfo fix",
  "fake-group-saturday-raid": "Justin: tomorrow at 20? I can bring the second mic",
  "fake-dm-mira": "Thanks for the invite!",
  "fake-dm-ole": "You: see you then",
};

export const FAKE_UNREAD: Record<string, number> = { "fake-dm-carlo": 2, "fake-group-saturday-raid": 5 };

export function fakeFriends(host: string): HostFriends {
  const person = (name: string, confirmed = true) => ({ serverUserId: id(name), nickname: name, at: minutesAgo(60 * 24), confirmed });
  return {
    host,
    friends: [person("Al"), person("Justin"), person("Ingrid"), person("Maja"), person("Carlo"), person("Mira"), person("Ole"), person("Sindre", false)],
    incoming: [{ serverUserId: id("Eirik"), nickname: "Eirik", at: minutesAgo(30) }],
    outgoing: [],
  };
}

export const FAKE_ACTIVITY: Record<string, string> = {
  "fake-al": "Playing Counter-Strike 2",
  "fake-justin": "Playing Counter-Strike 2",
  "fake-maja": "Playing Deep Rock Galactic",
};
