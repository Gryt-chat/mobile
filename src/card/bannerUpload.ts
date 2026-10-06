import { getServerHttpBase } from "../servers/address";
import type { ServerInfoDetails } from "../connection/types";

/** A picked picture, as the image picker hands it over. */
export interface PickedBanner {
  uri: string;
  mime: string;
  name: string;
}

/**
 * Whether this server takes a banner from you. Desktop's rule exactly: the server has to
 * say yes. No list is a no here, unlike `canOnServer`, because uploads are trusted-only.
 */
export function mayUploadBanner(info: ServerInfoDetails | undefined): boolean {
  const permissions = info?.permissions;
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes("upload_banner_image")) return true;
  // A server from before banners had their own permission let avatar uploaders set one.
  const catalogue = Array.isArray(info?.permission_catalogue) ? info.permission_catalogue : [];
  return !catalogue.includes("upload_banner_image") && permissions.includes("upload_avatar_image");
}

/** Uploads a banner to one server, or removes it with null. Throws with the server's reason. */
export async function sendBanner(host: string, token: string, banner: PickedBanner | null): Promise<void> {
  let body: FormData | undefined;
  if (banner) {
    // A real Blob, typed with slice: React Native's Blob has no settable type (see useProfile).
    const raw = await fetch(banner.uri).then((r) => r.blob());
    const file = (raw.type || "").startsWith("image/") ? raw : raw.slice(0, raw.size, banner.mime);
    body = new FormData();
    body.append("file", file, banner.name);
  }
  const res = await fetch(`${getServerHttpBase(host)}/api/uploads/banner`, {
    method: banner ? "POST" : "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (res.status === 404) throw new Error("This server can't take a banner yet.");
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    throw new Error(detail?.message ?? detail?.error ?? `The server refused it (${res.status}).`);
  }
}
