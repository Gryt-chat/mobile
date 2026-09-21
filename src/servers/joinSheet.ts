import type { ServerInfo } from "./info";

/* What the add-server sheet offers for a server it has found, decided without React so a
   test can check every case. The desktop's invite dialog (`inviteDialog.ts`) decides the same. */

export interface JoinSheetInput {
  /** The code in the link, normalised. Empty for a link that names only the server. */
  linkCode: string;
  /** What was typed into the sheet's own code field, normalised. */
  typedCode: string;
  info: Pick<ServerInfo, "identityTiers" | "joinPolicy" | "lanOpen">;
  /** Undefined until the keychain has been read, and never read as signed out before then. */
  signedIn: boolean | undefined;
  alreadyAdded: boolean;
}

export type JoinSheetAction =
  | { kind: "already" }
  | { kind: "sign-in" }
  | { kind: "join"; disabled: boolean };

export interface JoinSheetView {
  /** The server takes accounts only, and this phone is signed out. */
  needsAccount: boolean;
  showCodeField: boolean;
  /** Open lets anyone in, and LAN open lets in whoever is on the network, so neither can require it. */
  codeRequired: boolean;
  /** Stored for the join. A link's code goes even to an open server, so a role on it still lands. */
  code: string;
  action: JoinSheetAction;
}

export function joinSheetView(input: JoinSheetInput): JoinSheetView {
  const { info, linkCode, typedCode } = input;

  const needsAccount =
    input.signedIn === false && !!info.identityTiers && !info.identityTiers.includes("local");

  const showCodeField = !linkCode && info.joinPolicy === "invite";
  const codeRequired = showCodeField && !info.lanOpen;
  const code = linkCode || typedCode;

  const action: JoinSheetAction = input.alreadyAdded
    ? { kind: "already" }
    : needsAccount
      ? { kind: "sign-in" }
      : { kind: "join", disabled: codeRequired && code.length === 0 };

  return { needsAccount, showCodeField, codeRequired, code, action };
}
