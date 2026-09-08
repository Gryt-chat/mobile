import {
  groupMembersByRole,
  OFFLINE_GROUP_KEY,
  type MemberGroup as CoreMemberGroup,
} from "@gryt/core";

import type { Member, ServerInfoDetails } from "./types";

/**
 * The member list cut into role groups, from `@gryt/core`. This file held a second copy
 * that had drifted: a member with no `status` was offline here and present there.
 * **This app changes behaviour** — the old rule made an older server look empty.
 */
export { groupMembersByRole, OFFLINE_GROUP_KEY };

/** The roles a server describes, as `server:details` sends them. */
export type RoleSummary = NonNullable<ServerInfoDetails["roles"]>[number];

/** One block of the member list, holding this app's members. */
export type MemberGroup = CoreMemberGroup<Member>;
