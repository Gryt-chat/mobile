import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "expo-router";

import { useLanServers, type LanServersState } from "../servers/useLanServers";
import { useServers, type JoinedServer } from "../servers/store";
import type { Channel } from "../connection/types";
import type { IncomingShare } from "../share/incoming";
import type { Status } from "./data";

/* What the shell knows that no single screen owns: which server is active, and
 * whether the switcher or the add-server sheet is showing. **The server list is
 * not here** — that is `useServers`, which owns persistence. */

interface ShellValue {
  /** Null only while the list is empty, which the root layout handles. */
  server: JoinedServer | null;
  setServer: (host: string) => void;
  servers: JoinedServer[];

  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;


  addServerOpen: boolean;
  setAddServerOpen: (open: boolean) => void;

  /** What an invite link filled the join sheet with, if one opened it. */
  invite: string | undefined;
  setInvite: (invite: string | undefined) => void;

  /**
   * Something another app handed to Gryt, with nowhere to go yet; non-null means the
   * picker is showing. Here because a share arrives at the app, not a screen.
   */
  share: IncomingShare | null;
  setShare: (share: IncomingShare | null) => void;

  /**
   * A share given a destination, on its way to a composer. **The picker does not
   * send** — that would be a second path beside `chat:send`.
   */
  handoff: { channelId: string; share: IncomingShare } | null;
  setHandoff: (handoff: { channelId: string; share: IncomingShare } | null) => void;

  /**
   * Gryt servers advertising themselves on this network. **Here because only one
   * browser should exist**, and because a sheet's children are a different tree.
   */
  lan: LanServersState;

  /**
   * Derived on a real client, fixed here. Not settable on purpose — see the
   * note in `data.ts` about there being no manual picker.
   */
  status: Status;

  voice: VoiceState;
  toggleVoice: (key: keyof VoiceState) => void;
  /**
   * Set one directly, for when it is not you deciding: the server records somebody
   * without `speak` as muted, and **a toggle cannot express that**.
   */
  setVoice: (patch: Partial<VoiceState>) => void;

  /**
   * The voice channel you are in, or null. Here rather than in a screen because
   * the call outlives the screen that started it.
   */
  voiceChannel: Channel | null;
  setVoiceChannel: (channel: Channel | null) => void;

  /**
   * Whether the call is *showing*, which is not whether you are in one. As one flag,
   * dismissing the sheet hung up. Leaving is `setVoiceChannel(null)`.
   */
  voiceOpen: boolean;
  setVoiceOpen: (open: boolean) => void;
}

/** What you are doing in a call, and nothing else. */
export interface VoiceState {
  muted: boolean;
  deafened: boolean;
  /**
   * Your camera. Real because of `useCamera`, which opens it, hands the track to the
   * engine and tells the server which stream it is.
   */
  camera: boolean;
  /**
   * Your screen. A flag over something not symmetrical: Android captures in this
   * process, iOS in a second one. `useScreenShare` owns turning it back off.
   */
  screen: boolean;
}

const ShellContext = createContext<ShellValue | null>(null);

export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside ShellProvider.");
  return value;
}

export function ShellProvider({ children }: { children?: ReactNode }) {
  const { servers } = useServers();
  const [activeHost, setActiveHost] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [invite, setInvite] = useState<string | undefined>(undefined);
  const [share, setShare] = useState<IncomingShare | null>(null);
  const [handoff, setHandoff] = useState<{ channelId: string; share: IncomingShare } | null>(
    null,
  );
  const [voiceChannel, setVoiceChannel] = useState<Channel | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voice, setVoiceState] = useState<VoiceState>({
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
  });

  /* Only while something showing servers is up: a browser holds a socket, and on iOS
   * the first announcement asks for local network access.
   *
   * **Read off the pathname rather than a flag the page sets** (GRYT-491). */
  const pathname = usePathname();
  const lan = useLanServers(
    switcherOpen || addServerOpen || pathname === "/discovery",
    servers,
  );

  const value = useMemo<ShellValue>(() => {
    // Falls back to the first rather than holding a host that has been left, so
    // leaving the active server does not leave the header pointing at nothing.
    const server =
      servers.find((s) => s.host === activeHost) ?? servers[0] ?? null;

    return {
      server,
      setServer: setActiveHost,
      servers,
      switcherOpen,
      setSwitcherOpen,
      addServerOpen,
      setAddServerOpen,
      invite,
      setInvite,
      share,
      setShare,
      handoff,
      setHandoff,
      lan,
      status: "online",
      voice,
      toggleVoice: (key) => setVoiceState((v) => ({ ...v, [key]: !v[key] })),
      setVoice: (patch) => setVoiceState((v) => ({ ...v, ...patch })),
      voiceChannel,
      /* Joining always shows the call. Leaving always hides it. Only a dismiss
       * separates the two, which is the whole point of having both. */
      setVoiceChannel: (channel) => {
        setVoiceChannel(channel);
        setVoiceOpen(channel !== null);
        /* Hanging up unmutes and undeafens, or somebody eventually talks into a
         * microphone they muted an hour ago. **Only on leaving** — moving between
         * channels is one continuous piece of being in a call. */
        if (channel === null) {
          /* The camera and the screen go off with the call too, and for a stronger
           * reason: a share left on is a phone still broadcasting. */
          setVoiceState((v) => ({
            ...v,
            muted: false,
            deafened: false,
            camera: false,
            screen: false,
          }));
        }
      },
      voiceOpen,
      setVoiceOpen,
    };
  }, [
    servers,
    activeHost,
    switcherOpen,
    addServerOpen,
    invite,
    share,
    handoff,
    lan,
    voice,
    voiceChannel,
    voiceOpen,
  ]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
