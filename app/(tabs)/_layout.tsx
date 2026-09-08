import { useEffect, useRef } from "react";
import { router, useSegments } from "expo-router";
import { TabList, TabTrigger, Tabs, useTabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

import { ConnectionsProvider } from "../../src/connection/ConnectionsProvider";
import { ShareSheet } from "../../src/share/ShareSheet";
import { CallsProvider } from "../../src/connection/CallsProvider";
import { DirectMessagesProvider } from "../../src/connection/DirectMessagesProvider";
import { MembersProvider } from "../../src/connection/MembersProvider";
import { BlocksProvider } from "../../src/connection/BlocksProvider";
import { CustomEmojiProvider } from "../../src/chat/CustomEmojiProvider";
import { VoiceProvider } from "../../src/voice/VoiceProvider";
import { IncomingCallCard } from "../../src/shell/IncomingCallCard";
import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { TabBar } from "../../src/shell/TabBar";
import { CallButton } from "../../src/shell/CallButton";
import { TabPager } from "../../src/shell/TabPager";
import { PAGE_SLOT, TABS, channelIsOpen, tabIndexOf, type TabKey } from "../../src/shell/tabs";
import { useShell } from "../../src/shell/ShellContext";
import { useMe } from "../../src/shell/useMe";
import { useRememberRoute } from "../../src/feedback/session";
import { VoiceSheet } from "../../src/voice/VoiceSheet";
import { ProfileProvider, useProfileState } from "../../src/profile/ProfileProvider";
import { IdentityClaimPrompt } from "../../src/identity/IdentityClaimPrompt";

/**
 * The tab to draw, holding the last real one while you are off the tabs. "Not on a
 * tab" is not an answer the pager or the bar can use. See `src/shell/tabs.ts`.
 */
function useTabIndex(): number {
  const segments = useSegments();
  const current = tabIndexOf(segments);
  const last = useRef(0);
  if (current !== null) last.current = current;
  return last.current;
}

/** What `Pages` publishes so the bar can use it. See `Pages`. */
type SwitchTab = (key: TabKey) => void;

/**
 * The persistent navbar — ours, not `UITabBar`. `TabList` registers the routes and
 * `TabBar` draws; they share `TABS`, or a trigger is an unreachable tab.
 */
export default function TabsLayout() {
  const { server, servers, voiceChannel, setVoiceOpen } = useShell();
  /* Read here as well as in `useTabIndex`, because the bar's Server button needs to
     know whether there is a channel on top of the tab to go home from. */
  const segments = useSegments();
  /* So a bug report can say where somebody was, rather than saying they were
   * on the report form. `src/feedback/session.ts`. */
  useRememberRoute();
  const me = useMe(voiceChannel !== null);

  /**
   * Which slot the bar's capsule is at, shared with the pager. Slots rather than
   * pages, because the bar can be dragged too. See `src/shell/tabs.ts`.
   */
  const slot = useSharedValue(PAGE_SLOT[0]);

  /**
   * `switchTab`, published upwards. It is only callable inside `Tabs`, and the bar is
   * a sibling rather than a child — nested, it rendered nothing at all.
   */
  const switchTab = useRef<SwitchTab | null>(null);

  return (
    <ConnectionsProvider
      servers={servers}
      host={server?.host ?? null}
      nickname={me.name}
    >
      {/* Everyone on this server, which is what puts a name and a face on a
          voice tile and on somebody else's message. Inside the connection
          because the list arrives on its socket. */}
      <MembersProvider host={server?.host ?? null}>
      {/* Inside the member list, because the only things that read it are drawn
          from one: a row saying whether it is blocked, and the list somebody
          unblocks from. */}
      <BlocksProvider host={server?.host ?? null}>
        <DirectMessagesProvider host={server?.host ?? null}>
        {/* Ringing, which is the only part of a call the server keeps.
            Inside the direct messages because a ring names a conversation
            and the card draws that conversation's name. */}
        <CallsProvider host={server?.host ?? null}>
        {/* Inside the connection, because your name and picture on a server are
            read from its session. One instance for the whole shell — the navbar
            draws you, so does the You page, and so does your own voice tile.
            **Above `VoiceProvider`** for that last one: the voice sheet is a
            sibling of the tabs, so a provider that only wrapped them could not
            reach it. */}
        {/* Inside the connection, because the list is this server's and is
            fetched from its address. Beside the member list rather than under
            it: both are things a message needs in order to be drawn, and
            neither needs the other. */}
        <CustomEmojiProvider>
        <ProfileProvider host={server?.host ?? null}>
          {/* Inside the connection, because a room is granted by one server's
              socket and means nothing to another's. */}
          <VoiceProvider>
            <View style={{ flex: 1 }}>
              <Tabs>
                <Pages slot={slot} publish={switchTab} />

                {/* Registers the routes and draws nothing. The bar is what you
                    see; these are what the router needs to know the routes
                    exist. */}
                <TabList style={{ display: "none" }}>
                  {TABS.map((tab) => (
                    <TabTrigger key={tab.key} name={tab.key} href={tab.href} />
                  ))}
                </TabList>
              </Tabs>

              <Bar
                /*
                 * Pressing the tab you are already on goes home within it.
                 * `switchTab` leaves each stack where it was, which left the
                 * Server button inert while a channel was open.
                 */
                onSelect={(key) => {
                  if (key === "(server)" && channelIsOpen(segments)) {
                    router.dismissAll();
                    return;
                  }
                  switchTab.current?.(key);
                }}
                name={me.name}
                slot={slot}
              />

              {/* Beside the bar, not in it. Only while a call is running —
                  which is what makes it worth the corner it occupies. */}
              <CallButton
                inCall={voiceChannel !== null}
                onPress={() => setVoiceOpen(true)}
              />
            </View>

            {/* Beside the tabs rather than inside a screen, because each is
                reachable from the bar and has to cover it. The voice sheet also
                has to outlive the screen that opened it. */}
            <ServerSwitcher />
            <VoiceSheet />

            {/* Beside them for the same reason, and inside the connection so it
                can offer this server's channels when there are no recents yet.
                It is also where the app listens for a share arriving at all —
                see the note on the component. */}
            <ShareSheet />

            {/* Draws nothing. It asks, once per server, whether the account may
                take over the guest membership this device holds there — and it
                can only ask because the answer is known locally. See the note
                on the component. GRYT-502. */}
            <IdentityClaimPrompt host={server?.host ?? null} />

            {/* Beside the tabs like the sheets, and for the same reason: a ring
                arrives whatever screen you are on and has to cover the bar. */}
            <IncomingCallCard />
          </VoiceProvider>
        </ProfileProvider>
        </CustomEmojiProvider>
        </CallsProvider>
        </DirectMessagesProvider>
      </BlocksProvider>
      </MembersProvider>
    </ConnectionsProvider>
  );
}

/**
 * The three pageable screens, dragged between. **Switching tabs goes through
 * `switchTab`, not `router.navigate`** — a tab's `href` is its stack's index, so
 * navigating popped whatever was on it.
 */
function Pages({
  slot,
  publish,
}: {
  slot: SharedValue<number>;
  publish: React.RefObject<SwitchTab | null>;
}) {
  const index = useTabIndex();
  const inChannel = channelIsOpen(useSegments());
  const { setSwitcherOpen } = useShell();
  /* The name is required and any of the three would do — `switchTab` takes the
   * one it is switching to as an argument. */
  const { switchTab } = useTabTrigger({ name: TABS[0].key, href: TABS[0].href });

  useEffect(() => {
    publish.current = (key: TabKey) => switchTab(key, {});
    return () => {
      publish.current = null;
    };
  }, [switchTab, publish]);

  return (
    <TabPager
      index={index}
      order={TABS.map((tab) => tab.key)}
      slot={slot}
      enabled={!inChannel}
      onSettle={(next) => switchTab(TABS[next].key, {})}
      onPullPastStart={() => setSwitcherOpen(true)}
    />
  );
}

/**
 * Reads which tab is showing and hands it to the bar.
 *
 * Split out so it can use the router's own idea of the current route.
 */
function Bar({
  onSelect,
  name,
  slot,
}: {
  onSelect: (key: TabKey) => void;
  name: string;
  slot: SharedValue<number>;
}) {
  const index = useTabIndex();
  /* The bar's avatar follows the profile, rather than staying on the generated face.
     The name follows too, so a rename lands in both places. */
  const profile = useProfileState();

  return (
    <TabBar
      active={TABS[index].key}
      onSelect={onSelect}
      name={profile.nickname || name}
      avatarUrl={profile.avatarUrl}
      slot={slot}
    />
  );
}
