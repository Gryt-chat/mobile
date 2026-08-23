import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { getServerHttpBase } from "../servers/address";
import { useShell } from "../shell/ShellContext";

const CustomEmojiContext = createContext<ReadonlyMap<string, string>>(new Map());

/**
 * The emoji this server has of its own, as name to picture.
 *
 * **One instance, not one per message.** Every row that draws a `:shortcode:`
 * needs this map, and there can be a hundred on screen — so it is fetched once
 * per server and read from context, the same reason `ProfileProvider` exists.
 *
 * Inside `ConnectionsProvider`, because both halves come from the connection:
 * the address to fetch from, and the socket that says when the set has changed.
 *
 * **The list is names and file ids over HTTP, not over the socket.** That is
 * the desktop's route too — `GET /api/emojis`, and `server:emojis:updated` only
 * says "again", carrying nothing. Worth knowing rather than looking for a
 * payload that is not there.
 */
export function CustomEmojiProvider({ children }: { children?: ReactNode }) {
  const { socket, online } = useServerConnection();
  /* The address off the shell rather than the connection: `ConnectionState`
   * carries what the server said about itself and not where it was dialled,
   * which is what `ChannelScreen` does for the same reason. */
  const { server } = useShell();
  const host = server?.host ?? null;
  const [emojis, setEmojis] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!host || !online) {
      /* Cleared rather than kept. The map belongs to one server, and holding
       * the last one's through a switch would draw the wrong picture for a
       * name that exists on both. */
      setEmojis(new Map());
      return;
    }

    let cancelled = false;

    const load = () => {
      fetch(`${getServerHttpBase(host)}/api/emojis`)
        .then((response) => (response.ok ? response.json() : []))
        .then((list: unknown) => {
          if (cancelled || !Array.isArray(list)) return;
          setEmojis(
            new Map(
              list
                .filter(
                  (entry): entry is { name: string; file_id: string } =>
                    typeof entry?.name === "string" && typeof entry?.file_id === "string",
                )
                .map((entry) => [
                  entry.name,
                  `${getServerHttpBase(host)}/api/emojis/img/${encodeURIComponent(entry.name)}`,
                ]),
            ),
          );
        })
        .catch(() => {
          /* A server with no emoji route, or one that is briefly unreachable.
           * An empty map draws every shortcode as its own text, which is what
           * happened before any of this existed — so failing is a step back to
           * the old behaviour rather than a broken screen. */
        });
    };

    load();
    socket?.on("server:emojis:updated", load);
    return () => {
      cancelled = true;
      socket?.off("server:emojis:updated", load);
    };
  }, [host, online, socket]);

  return <CustomEmojiContext.Provider value={emojis}>{children}</CustomEmojiContext.Provider>;
}

/**
 * Empty rather than throwing where there is no provider.
 *
 * A message can be drawn outside a connection — the component catalogue does
 * exactly that — and "this server has no custom emoji" is a true and harmless
 * thing to say there.
 */
export function useCustomEmojis(): ReadonlyMap<string, string> {
  return useContext(CustomEmojiContext);
}
