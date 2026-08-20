import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { SERVERS, type Server, type Status } from "./data";

/* What the shell knows that no single screen owns.
 *
 * Three things: which server is active, whether the server switcher is showing,
 * and whether the "you" sheet is showing. All three are app-wide because all
 * three are reachable from the tab bar, which outlives every screen.
 *
 * This is not a store and should not become one. Server membership, status and
 * the rest belong to whatever talks to the server; they are here because the
 * shell has to render something and there is nothing to talk to yet.
 */

interface ShellValue {
  server: Server;
  setServer: (id: string) => void;
  servers: Server[];

  /** The side drawer: every server, plus adding one and discovery. */
  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;

  /** The bottom sheet behind the avatar in the tab bar. */
  youOpen: boolean;
  setYouOpen: (open: boolean) => void;

  /**
   * Derived on a real client, fixed here. It is not settable on purpose —
   * see the note in `data.ts` about there being no manual picker.
   */
  status: Status;

  /** Voice, which the mini controls in the sheet act on. */
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
  const [serverId, setServerId] = useState(SERVERS[0].id);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [youOpen, setYouOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceState>({
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
  });

  const value = useMemo<ShellValue>(() => {
    const server = SERVERS.find((s) => s.id === serverId) ?? SERVERS[0];
    return {
      server,
      setServer: setServerId,
      servers: SERVERS,
      switcherOpen,
      setSwitcherOpen,
      youOpen,
      setYouOpen,
      status: "online",
      voice,
      toggleVoice: (key) => setVoice((v) => ({ ...v, [key]: !v[key] })),
    };
  }, [serverId, switcherOpen, youOpen, voice]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
