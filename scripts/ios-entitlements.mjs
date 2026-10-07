#!/usr/bin/env node
/* `node scripts/ios-entitlements.mjs <bundle> <target .entitlements>`: what one exported bundle
   should be signed with, as a plist. Asked-for keys, with the values its embedded profile grants. */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Every App Store signature carries these, whatever the target asks for. */
const ALWAYS = ["application-identifier", "com.apple.developer.team-identifier", "get-task-allow", "beta-reports-active"];

function plistToObject(xmlOrBinary) {
  return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "-"], { input: xmlOrBinary }).toString());
}

function objectToPlist(obj) {
  return execFileSync("plutil", ["-convert", "xml1", "-o", "-", "-"], { input: JSON.stringify(obj) }).toString();
}

/** A profile grants a group either by name or with a wildcard, like `8883W2XTQ8.*`. */
function granted(allowed, value) {
  return allowed.some((a) => a === value || (a.endsWith("*") && value.startsWith(a.slice(0, -1))));
}

export function entitlementsFor(requested, profile) {
  const out = {};
  for (const key of ALWAYS) if (key in profile) out[key] = profile[key];
  const missing = [];
  for (const [key, want] of Object.entries(requested)) {
    if (!(key in profile)) {
      missing.push(key);
      continue;
    }
    const grant = profile[key];
    if (Array.isArray(want)) {
      const allowed = Array.isArray(grant) ? grant : [grant];
      const refused = want.filter((v) => !granted(allowed, v));
      if (refused.length) missing.push(`${key} (${refused.join(", ")})`);
      out[key] = want;
    } else {
      // The profile's value wins: it's what Apple checks against, and production here.
      out[key] = grant;
    }
  }
  if (missing.length) throw new Error(`the profile doesn't grant: ${missing.join("; ")}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [bundle, targetFile] = process.argv.slice(2);
  if (!bundle || !targetFile) {
    console.error("usage: ios-entitlements.mjs <bundle> <target .entitlements>");
    process.exit(2);
  }
  const provision = join(bundle, "embedded.mobileprovision");
  if (!existsSync(provision)) {
    console.error(`no embedded.mobileprovision in ${bundle}`);
    process.exit(1);
  }
  // Only the Entitlements dict: the rest of a profile has dates and data, which JSON can't hold.
  const decoded = execFileSync("security", ["cms", "-D", "-i", provision]);
  const profile = plistToObject(execFileSync("plutil", ["-extract", "Entitlements", "xml1", "-o", "-", "-"], { input: decoded }));
  const requested = existsSync(targetFile) ? plistToObject(execFileSync("cat", [targetFile])) : {};
  try {
    process.stdout.write(objectToPlist(entitlementsFor(requested, profile)));
  } catch (err) {
    console.error(`${bundle}: ${err.message}`);
    process.exit(1);
  }
}
