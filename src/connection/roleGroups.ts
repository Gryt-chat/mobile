import {
  groupMembersByRole,
  OFFLINE_GROUP_KEY,
  type MemberGroup as CoreMemberGroup,
} from "@gryt/core";

import type { Member, ServerInfoDetails } from "./types";

/**
 * The member list cut into role groups, from `@gryt/core`. A member with no `status` is
 * present rather than offline, which is what an older server sends (GRYT-898).
 */
export { groupMembersByRole, OFFLINE_GROUP_KEY };

/** The roles a server describes, as `server:details` sends them. */
export type RoleSummary = NonNullable<ServerInfoDetails["roles"]>[number];

/** One block of the member list, holding this app's members. */
export type MemberGroup = CoreMemberGroup<Member>;
