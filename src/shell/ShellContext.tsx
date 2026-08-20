import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useServers, type JoinedServer } from "../servers/store";
import type { Status } from "./data";

/* What the shell knows that no single screen owns.
 *
 * Which server is active, whether the switcher is showing, whether the "you"
 * sheet is showing, and whether the add-server sheet is showing. All of them
 * are app-wide because all of them are reachable from chrome that outlives
 * every screen.
 *
 * The server *list* is not here — it is `useServers`, which owns persistence.
 * This holds which of them you are looking at, which is not worth persisting
 * until there is something on screen that takes time to get back to.
 */

interface ShellValue {
  /** Null only while the list is empty, which the root layout handles. */
  server: JoinedServer | null;
  setServer: (host: string) => void;
  servers: JoinedServer[];

  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;

  youOpen: boolean;
  setYouOpen: (open: boolean) => void;

  addServerOpen: boolean;
  setAddServerOpen: (open: boolean) => void;

  /** What an invite link filled the join sheet with, if one opened it. */
  invite: string | undefined;
  setInvite: (invite: string | undefined) => void;

  /**
   * Derived on a real client, fixed here. Not settable on purpose — see the
   * note in `data.ts` about there being no manual picker.
   */
  status: Status;

  voice: VoiceState;
  toggleVoice: (key: keyof VoiceState) => void;
}

export interface VoiceState {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
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
  const [youOpen, setYouOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [invite, setInvite] = useState<string | undefined>(undefined);
  const [voice, setVoice] = useState<VoiceState>({
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
  });

  const value = useMemo<ShellValue>(() => {
    // Falls back to the first rather than holding a host that has been left,
    // so leaving the active server does not leave the header pointing at
    // nothing.
    const server =
      servers.find((s) => s.host === activeHost) ?? servers[0] ?? null;

    return {
      server,
      setServer: setActiveHost,
      servers,
      switcherOpen,
      setSwitcherOpen,
      youOpen,
      setYouOpen,
      addServerOpen,
      setAddServerOpen,
      invite,
      setInvite,
      status: "online",
      voice,
      toggleVoice: (key) => setVoice((v) => ({ ...v, [key]: !v[key] })),
    };
  }, [servers, activeHost, switcherOpen, youOpen, addServerOpen, invite, voice]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
