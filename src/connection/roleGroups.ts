import {
  groupMembersByRole,
  OFFLINE_GROUP_KEY,
  type MemberGroup as CoreMemberGroup,
} from "@gryt/core";

import type { Member, ServerInfoDetails } from "./types";

/**
 * The member list cut into role groups, from `@gryt/core` (GRYT-898). This file
 * held a second copy of the desktop's rules and said so in its own header — and
 * the two had drifted on one of them: a member with no `status` was offline
 * here and present there.
 *
 * The desktop's reading is the one core kept, so **this app changes behaviour**.
 * The server always sends a status, so nothing produces the case except a
 * server too old to have the field, and on one of those every member read as
 * offline and the list looked empty.
 */
export { groupMembersByRole, OFFLINE_GROUP_KEY };

/** The roles a server describes, as `server:details` sends them. */
export type RoleSummary = NonNullable<ServerInfoDetails["roles"]>[number];

/** One block of the member list, holding this app's members. */
export type MemberGroup = CoreMemberGroup<Member>;
