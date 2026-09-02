/**
 * Talking to App Store Connect.
 *
 * Shared by `ios-dist-cert.mjs` and `ios-profiles.mjs` rather than written
 * twice, because the ES256 detail below is the kind of thing that gets fixed in
 * one copy.
 *
 * The key id and issuer id are not secrets — they are useless without the .p8,
 * which is the thing that must not leave the machine — but they are also not
 * this repository's business, so they come from the environment. Set them
 * alongside the .p8 you already have for `yarn testflight`:
 *
 *   export GRYT_IOS_ASC_KEY_ID=...
 *   export GRYT_IOS_ASC_ISSUER_ID=...
 *
 * With only one key in ~/.appstoreconnect/private_keys/ the id is read from the
 * filename and only the issuer has to be set.
 */

import { createSign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEYS_DIR = join(homedir(), ".appstoreconnect", "private_keys");

function resolveKey() {
  let id = process.env.GRYT_IOS_ASC_KEY_ID;
  const explicit = process.env.GRYT_IOS_ASC_KEY_PATH;
  if (explicit) {
    if (!id) id = explicit.match(/AuthKey_([A-Z0-9]+)\.p8$/)?.[1];
    return { id, pem: readFileSync(explicit, "utf8") };
  }
  let names;
  try {
    names = readdirSync(KEYS_DIR).filter((f) => /^AuthKey_[A-Z0-9]+\.p8$/.test(f));
  } catch {
    names = [];
  }
  if (id) {
    return { id, pem: readFileSync(join(KEYS_DIR, `AuthKey_${id}.p8`), "utf8") };
  }
  if (names.length === 1) {
    const only = names[0];
    return { id: only.match(/AuthKey_([A-Z0-9]+)\.p8$/)[1], pem: readFileSync(join(KEYS_DIR, only), "utf8") };
  }
  throw new Error(
    names.length === 0
      ? `No App Store Connect key in ${KEYS_DIR}. The .p8 downloads once and never again — see the README, "Uploading it".`
      : `Several keys in ${KEYS_DIR}. Set GRYT_IOS_ASC_KEY_ID to pick one: ${names.join(", ")}`,
  );
}

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

let cached;
function credentials() {
  if (!cached) {
    const { id, pem } = resolveKey();
    const issuer = process.env.GRYT_IOS_ASC_ISSUER_ID;
    if (!issuer) throw new Error("Set GRYT_IOS_ASC_ISSUER_ID — App Store Connect, Users and Access, Integrations.");
    if (!id) throw new Error("Set GRYT_IOS_ASC_KEY_ID — the id in the .p8's filename.");
    cached = { id, pem, issuer };
  }
  return cached;
}

export function token() {
  const { id, pem, issuer } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const signing = `${b64url({ alg: "ES256", kid: id, typ: "JWT" })}.${b64url({
    iss: issuer,
    iat: now,
    exp: now + 600,
    aud: "appstoreconnect-v1",
  })}`;
  const s = createSign("SHA256");
  s.update(signing);
  // Raw r||s. Node emits DER by default and Apple calls that a malformed token
  // rather than a bad signature, which sends you looking at the key.
  return `${signing}.${s.sign({ key: pem, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

export async function api(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.text();
  if (!res.ok) {
    let detail = body;
    try {
      detail = JSON.parse(body).errors?.map((e) => `${e.title}: ${e.detail}`).join("\n") || body;
    } catch {}
    // 403 is nearly always the key's role. An App Manager key may create and
    // revoke certificates and profiles; what it may not do is use the
    // cloud-managed certificate, and that fails elsewhere with a message about
    // cloud signing rather than about permissions.
    throw new Error(`${res.status} ${init.method || "GET"} ${path}\n${detail}`);
  }
  return body ? JSON.parse(body) : null;
}
