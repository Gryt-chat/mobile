#!/usr/bin/env node
/**
 * The App Store provisioning profiles CI exports with, made to match the
 * certificate CI signs with.
 *
 * Run by `Release iOS` on every run. You would run it by hand only to see what
 * it would do, or after `ios-dist-cert.mjs` has replaced an expired
 * certificate.
 *
 * **Why this exists at all.** Automatic signing asks App Store Connect for a
 * profile on the fly, and that works on a laptop. On a runner it does not: the
 * request goes through cloud signing, which an App Manager key may not use, and
 * the export dies with
 *
 *     error: exportArchive Cloud signing permission error
 *     error: exportArchive No profiles for 'chat.gryt.mobile' were found
 *
 * even with a perfectly good certificate in the keychain. That is run
 * 33690076238. Creating the profiles through the API instead is a different
 * operation, and an App Manager key is allowed to do it. Once they exist and
 * are installed, the export is told to sign manually and Apple is not asked to
 * sign anything.
 *
 * The three bundle ids are not a list to maintain: they are read from
 * `app.json`, so an extension added there cannot be forgotten here.
 *
 *   node scripts/ios-profiles.mjs           # find or create, install, print the map
 *   node scripts/ios-profiles.mjs --dry-run # say what it would do
 *   node scripts/ios-profiles.mjs --cert U73UAL4SRC
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { api } from "./asc.mjs";

const PROFILE_TYPE = "IOS_APP_STORE";
/* Both locations. Xcode 26 reads the second, `xcodebuild -exportArchive` still
   reads the first, and writing one of them produces "no profiles were found"
   from a tool that is looking somewhere else. */
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
 * The app and every extension that ships inside it.
 *
 * Not a list kept here. `plugins/appExtension.js` builds every extension's id
 * as `${config.ios.bundleIdentifier}.${bundleSuffix}`, so the suffixes in the
 * plugins are the source of truth and an extension added there turns up here
 * without anybody remembering to.
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
    // A profile is a snapshot of the certificates it was made with. When the
    // certificate is replaced this one keeps pointing at the old one and the
    // export signs with something the profile does not list.
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
