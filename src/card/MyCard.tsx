import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { useCustomEmojis } from "../chat/CustomEmojiProvider";
import { attachmentUrl } from "../chat/files";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { useShell } from "../shell/ShellContext";
import { MemberCard } from "./MemberCard";
import { owlColour } from "./owlColour";

/**
 * Your own member card at the top of the You page, as others see it on this server. The plain
 * picture and name stand in until your row arrives.
 */
export function MyCard({
  onEdit,
  rename,
  pickPicture,
  fallback,
}: {
  onEdit: () => void;
  rename: (() => void) | null;
  pickPicture: (() => void) | null;
  /** The plain picture and name, until your row arrives. */
  fallback: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { me } = useServerConnection();
  const { all, avatarUrlFor, nameTags } = useMembers();
  const { server } = useShell();
  const customEmojis = useCustomEmojis();

  const mine = me ? all.find((m) => m.serverUserId === me.serverUserId) : undefined;
  if (!mine) return <>{fallback}</>;

  const banner =
    mine.bannerFileId && server?.host
      ? {
          still: attachmentUrl(server.host, mine.bannerFileId, mine.bannerVideo === true),
          video: mine.bannerVideo === true ? attachmentUrl(server.host, mine.bannerFileId) : null,
        }
      : null;

  return (
    <MemberCard
      member={mine}
      owlHex={owlColour(mine.nickname, mine.avatarWorn)}
      avatarUrl={avatarUrlFor(mine)}
      bannerUrl={banner?.still ?? null}
      bannerVideoUrl={banner?.video ?? null}
      nameTag={nameTags.get(mine.serverUserId)}
      customEmojis={customEmojis}
      width={width - theme.space(4) * 2}
      actions={[
        { label: "Edit card", onPress: onEdit },
        ...(rename ? [{ label: "Name", onPress: rename }] : []),
        ...(pickPicture ? [{ label: "Picture", onPress: pickPicture }] : []),
      ]}
    />
  );
}
