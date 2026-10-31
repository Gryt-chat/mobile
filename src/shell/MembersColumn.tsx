import { useServerConnection } from "../connection/ConnectionsProvider";
import { MembersDrawer } from "./MembersDrawer";
import { useCanStartDm, useOpenDm } from "./openDm";

/** The member list kept open beside the channel, as on the desktop. */
export function MembersColumn() {
  const { state, me } = useServerConnection();
  const openDmWith = useOpenDm();
  const canStartDm = useCanStartDm();

  return (
    <MembersDrawer
      inline
      open
      onOpenChange={() => {}}
      channels={state.status === "ready" ? state.channels : []}
      me={me?.serverUserId ?? null}
      onMessage={canStartDm ? (member) => openDmWith(member.serverUserId) : undefined}
    />
  );
}
