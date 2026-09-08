// Bump the build numbers in app.json. Both stores refuse a repeated one *after* the
// upload has finished. **They move together, and one is usually wasted** — their only
// job is to be larger than last time. The formats differ because the stores do.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../app.json", import.meta.url);
const config = JSON.parse(readFileSync(path, "utf8"));

const ios = config.expo.ios.buildNumber;
if (!/^\d+$/.test(ios ?? "")) {
  console.error(
    `ios.buildNumber is ${JSON.stringify(ios)}, which this cannot increment. ` +
      "It has to be a plain integer string.",
  );
  process.exit(1);
}

const android = config.expo.android.versionCode;
if (!Number.isInteger(android) || android < 1) {
  console.error(
    `android.versionCode is ${JSON.stringify(android)}, which this cannot increment. ` +
      "It has to be a positive integer — a number, not a string.",
  );
  process.exit(1);
}

const nextIos = String(Number(ios) + 1);
const nextAndroid = android + 1;

config.expo.ios.buildNumber = nextIos;
config.expo.android.versionCode = nextAndroid;

// Two spaces and a trailing newline, matching what is already in the file.
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(
  `ios.buildNumber ${ios} -> ${nextIos}, ` +
    `android.versionCode ${android} -> ${nextAndroid} ` +
    `(version ${config.expo.version})`,
);
