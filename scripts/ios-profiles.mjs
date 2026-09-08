#!/usr/bin/env node
/**
 * The App Store profiles CI exports with, matching the certificate it signs with. Cloud
 * signing needs an Admin key; the API does not. Bundle ids are read from `app.json`.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { api } from "./asc.mjs";

const PROFILE_TYPE = "IOS_APP_STORE";
/* Both locations: Xcode 26 reads the second, `xcodebuild -exportArchive` still reads
   the first, and writing one gives "no profiles were found" from the other. */
const INSTALL_DIRS = [
  join(homedir(), "Library", "MobileDevice", "Provisioning Profiles"),
  join(homedir(), "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// `indexOf` is -1 when absent, and -1 + 1 is 0, which quietly makes the first
// flag the certificate id.
const certAt = args.indexOf("--cert");
const certArg = certAt === -1 ? undefined : args[certAt + 1];

/**
 * The app and every extension that ships inside it — not a list kept here.
 * `plugins/appExtension.js` builds each id, so the suffixes are the source of truth.
 */
function bundleIds() {
  const root = new URL("../", import.meta.url);
  const base = JSON.parse(readFileSync(new URL("app.json", root), "utf8")).expo.ios.bundleIdentifier;
  const ids = [base];
  for (const file of readdirSync(new URL("plugins/", root))) {
    if (!file.endsWith(".js")) continue;
    const src = readFileSync(new URL(`plugins/${file}`, root), "utf8");
    for (const m of src.matchAll(/bundleSuffix:\s*"([^"]+)"/g)) ids.push(`${base}.${m[1]}`);
  }
  return [...new Set(ids)];
}

async function distributionCertificate() {
  const { data } = await api("/v1/certificates?limit=200");
  const dist = data.filter((c) => c.attributes.certificateType === "DISTRIBUTION");
  if (certArg) {
    const found = dist.find((c) => c.id === certArg);
    if (!found) throw new Error(`No DISTRIBUTION certificate ${certArg}. Have: ${dist.map((c) => c.id).join(", ") || "none"}`);
    return found;
  }
  if (dist.length === 1) return dist[0];
  if (dist.length === 0) {
    throw new Error("No distribution certificate on the account. Run `yarn ios:cert` first.");
  }
  // Two is what a renewal looks like, and picking the wrong one produces
  // profiles that expire sooner than you think.
  throw new Error(
    `${dist.length} distribution certificates. Pass --cert <id>:\n` +
      dist.map((c) => `  ${c.id}  expires ${c.attributes.expirationDate?.slice(0, 10)}`).join("\n"),
  );
}

async function bundleIdResource(identifier) {
  const { data } = await api(`/v1/bundleIds?limit=200&filter[identifier]=${encodeURIComponent(identifier)}`);
  const found = data.find((b) => b.attributes.identifier === identifier);
  if (!found) throw new Error(`No App ID registered for ${identifier}. Archive once from Xcode, or register it in the developer portal.`);
  return found;
}

async function findOrCreate(identifier, certId) {
  const name = `Gryt CI App Store ${identifier}`;
  const { data } = await api("/v1/profiles?limit=200&include=certificates");
  const existing = data.find((p) => p.attributes.name === name);

  if (existing) {
    const carries = (existing.relationships?.certificates?.data || []).some((c) => c.id === certId);
    const live = existing.attributes.profileState === "ACTIVE";
    if (carries && live) return { profile: existing, action: "reused" };
    // A profile is a snapshot of the certificates it was made with. When one is
    // replaced the profile keeps pointing at the old certificate.
    if (dryRun) return { profile: existing, action: carries ? "would recreate (not active)" : "would recreate (wrong certificate)" };
    await api(`/v1/profiles/${existing.id}`, { method: "DELETE" });
  }
  if (dryRun) return { profile: null, action: "would create" };

  const bundle = await bundleIdResource(identifier);
  const { data: created } = await api("/v1/profiles", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "profiles",
        attributes: { name, profileType: PROFILE_TYPE },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundle.id } },
          certificates: { data: [{ type: "certificates", id: certId }] },
        },
      },
    }),
  });
  return { profile: created, action: existing ? "recreated" : "created" };
}

function install(profile) {
  const bytes = Buffer.from(profile.attributes.profileContent, "base64");
  for (const dir of INSTALL_DIRS) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${profile.attributes.uuid}.mobileprovision`), bytes);
  }
}

const cert = await distributionCertificate();
console.error(`certificate ${cert.id}, expires ${cert.attributes.expirationDate?.slice(0, 10)}`);

const map = {};
for (const identifier of bundleIds()) {
  const { profile, action } = await findOrCreate(identifier, cert.id);
  if (profile) {
    if (!dryRun) install(profile);
    map[identifier] = profile.attributes.name;
    console.error(`  ${action.padEnd(32)} ${identifier}  expires ${profile.attributes.expirationDate?.slice(0, 10)}`);
  } else {
    console.error(`  ${action.padEnd(32)} ${identifier}`);
  }
}

// The map goes to stdout and everything else to stderr, so the workflow can
// capture this alone.
console.log(JSON.stringify(map));
