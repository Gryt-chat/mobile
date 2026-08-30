// Bump the build numbers in app.json — ios.buildNumber and android.versionCode.
//
// Both stores refuse an upload whose build number they have already seen, and
// both refuse it *after* the upload has finished rather than before it starts.
// On a 34 MB artifact you wait for the whole transfer before being told.
//
// `version` is what people see and is bumped by hand when it means something.
// These two only have to go up.
//
// **They move together, and one of them is usually wasted.** A release that
// only goes to TestFlight still advances the Android number, so the two drift
// apart and neither is a count of anything. That is fine: their only job is to
// be larger than last time, and one script that always leaves both usable beats
// two that have to be remembered separately — the failure mode being a build
// refused after it uploaded.
//
// The formats differ because the stores do. iOS wants a string; Android wants
// an integer, and Gradle refuses a quoted one.
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
