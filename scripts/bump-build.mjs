// Bump ios.buildNumber in app.json.
//
// App Store Connect refuses an upload whose CFBundleVersion it has already
// seen, and it refuses it *after* the upload has finished rather than before it
// starts — so on a 34 MB ipa you wait for the whole thing before being told.
//
// `version` is what people see and is bumped by hand when it means something.
// This one only has to go up.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../app.json", import.meta.url);
const config = JSON.parse(readFileSync(path, "utf8"));

const current = config.expo.ios.buildNumber;
if (!/^\d+$/.test(current ?? "")) {
  console.error(
    `ios.buildNumber is ${JSON.stringify(current)}, which this cannot increment. ` +
      "It has to be a plain integer string.",
  );
  process.exit(1);
}

const next = String(Number(current) + 1);
config.expo.ios.buildNumber = next;

// Two spaces and a trailing newline, matching what is already in the file.
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`ios.buildNumber ${current} -> ${next} (version ${config.expo.version})`);
