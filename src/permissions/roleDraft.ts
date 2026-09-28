/**
 * A role's id comes from its name and cannot change afterwards, so a new role is
 * held locally — under `NEW_ROLE` — until it has a name worth minting one from.
 */

export const NEW_ROLE = "__new__";

/** Lower-case letters, numbers and dashes, up to 32 — what the server accepts
    as a role id. */
export function slugifyRoleId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
