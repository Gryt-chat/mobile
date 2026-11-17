import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import type { Socket } from "socket.io-client";

import { youPage } from "../shell/twoPane";
import { addApproveRequest, removeApproveRequest } from "./approveRequests";
import { checkApproveTicket, pendingApproveTicket } from "./approveTicket";
import { accountConfig } from "./config";
import { certificateSubject, getAccountCertificate, onApprovalRequired, onKeyDropped } from "./store";

/** One server's half of "approve me": ask from a waiting phone, prompt on an approved one. Returns the cleanup. */
export function approveAsksOn(socket: Socket, host: string, getAccessToken: () => Promise<string | null>): () => void {
  const askToBeApproved = () => {
    const ticket = pendingApproveTicket();
    if (ticket && socket.connected) socket.emit("device:approve:ask", { ticket });
  };
  /** Checks an ask and puts it on the You page's card. True when it was real. */
  const track = async (ask?: { askId?: string; ticket?: string }): Promise<{ deviceType: string; deny: () => void } | null> => {
    if (pendingApproveTicket() || typeof ask?.askId !== "string" || typeof ask.ticket !== "string") return null;
    const { askId } = ask;
    const sub = await certificateSubject();
    const ok = sub ? await checkApproveTicket(ask.ticket, sub) : null;
    if (!ok) return null;
    const deny = () => {
      socket.emit("device:approve:deny", { askId });
      removeApproveRequest(host, askId);
    };
    addApproveRequest({ host, askId, deviceType: ok.deviceType, expiresAt: ok.expiresAt, deny });
    return { deviceType: ok.deviceType, deny };
  };
  const asked = (ask?: { askId?: string; ticket?: string }) => {
    void track(ask).then((ok) => ok && showApprovePrompt(ok.deviceType, ok.deny));
  };
  // Asks made while this phone was away go on the card without a pop-up.
  const fetchPending = () =>
    socket.emit("device:approve:pending", {}, (asks?: { askId?: string; ticket?: string }[]) => {
      if (Array.isArray(asks)) for (const ask of asks) void track(ask);
    });
  const closed = (event?: { askId?: string }) => {
    if (typeof event?.askId === "string") removeApproveRequest(host, event.askId);
  };
  const askAgain = async () => {
    const token = await getAccessToken();
    await getAccountCertificate(host, token).catch(() => undefined);
  };
  const denied = () =>
    Alert.alert(
      "Your other device said no",
      "One of your devices answered \"Not me\", so this one wasn't approved. Your DMs stay locked here. Servers and calls still work. Pressed it by mistake? Ask again.",
      [
        { text: "Close", style: "cancel" },
        { text: "Ask again", onPress: () => void askAgain() },
      ],
    );

  socket.on("device:approve:asked", asked);
  socket.on("device:approve:denied", denied);
  socket.on("device:approve:closed", closed);
  socket.on("connect", fetchPending);
  if (socket.connected) fetchPending();
  const stopListening = onApprovalRequired(askToBeApproved);
  const stopDropped = onKeyDropped(() => void askAgain());
  askToBeApproved();
  return () => {
    stopDropped();
    socket.off("device:approve:asked", asked);
    socket.off("device:approve:denied", denied);
    socket.off("device:approve:closed", closed);
    socket.off("connect", fetchPending);
    removeApproveRequest(host);
    stopListening();
  };
}

function showApprovePrompt(deviceType: string, deny: () => void): void {
  const article = /^[aeiou]/i.test(deviceType) ? "An" : "A";
  Alert.alert(
    `${article} ${deviceType} wants to be approved`,
    "Signed in to your account just now. Only approve it if it's in front of you: you'll type the code it shows.",
    [
      {
        text: "Not me",
        style: "cancel",
        onPress: () => {
          deny();
          showNotMe();
        },
      },
      { text: "Approve", onPress: () => router.push(youPage("/link-device")) },
    ],
  );
}

export function showNotMe(): void {
  Alert.alert(
    "That wasn't you?",
    "You said you don't know that device. Most likely someone else has your password. The device didn't get your key, so it can't read your messages. Change your password so it can't sign in again.",
    [
      { text: "Later", style: "cancel" },
      { text: "Change password", onPress: () => void WebBrowser.openBrowserAsync(`${accountConfig().issuer.replace(/\/+$/, "")}/account`) },
    ],
  );
}
