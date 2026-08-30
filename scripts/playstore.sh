#!/usr/bin/env bash
#
# Build a Play-ready Android App Bundle.
#
# The Android half of `testflight.sh`, and its lessons carry over exactly: Play
# refuses a repeated `versionCode` *after* the upload finishes, and a wrongly
# signed bundle is rejected at the far end. So this asserts what it actually
# produced rather than trusting the toolchain, and `yarn bump:build` moves the
# number afterwards.
#
# It does not upload. That needs an app record and a service account key, and
# neither can exist until Google has verified the developer account. See
# "Uploading it" in the README.
set -euo pipefail

# ── The upload key ──────────────────────────────────────────────────────
#
# Two keys, not one. With Play App Signing — which is on by default for a new
# app and is the right choice — Google holds the *app signing* key that ends up
# on a phone, and we hold an *upload* key that only proves a build came from us.
# Losing the upload key is recoverable by asking Google to reset it. Losing the
# app signing key, if you insisted on holding it, is not: nobody could ever ship
# an update to that listing again.
#
# So what this signs with, and what the fingerprint below belongs to, is the
# upload certificate. It is not what a user's device verifies.
#
# Nothing here is written down in the repository. Create the keystore once:
#
#   keytool -genkeypair -v \
#     -keystore ~/.gryt/gryt-upload.jks -alias gryt-upload \
#     -keyalg RSA -keysize 4096 -validity 10000
#
# and put the four values in your shell profile. `*.jks` is gitignored, and a
# keystore in this working tree would still be one command away from a commit —
# keep it outside.
: "${GRYT_ANDROID_KEYSTORE:?set it to the .jks path, e.g. ~/.gryt/gryt-upload.jks}"
: "${GRYT_ANDROID_KEYSTORE_PASSWORD:?the keystore password}"
: "${GRYT_ANDROID_KEY_ALIAS:?the key alias, e.g. gryt-upload}"
: "${GRYT_ANDROID_KEY_PASSWORD:?the key password}"

if [[ ! -f "$GRYT_ANDROID_KEYSTORE" ]]; then
  echo "No keystore at $GRYT_ANDROID_KEYSTORE." >&2
  echo "See the keytool command in the comment at the top of this script." >&2
  exit 1
fi

# Gradle needs a JDK and macOS does not ship one. `/usr/bin/java` is a stub that
# prints "Unable to locate a Java Runtime" and sends you to java.com, which is
# not where the answer is — the answer is that Homebrew put it somewhere not on
# `PATH`. Checked here rather than fifty lines later inside Gradle.
if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  BREW_JDK="/opt/homebrew/opt/openjdk@17"
  if [[ -x "$BREW_JDK/bin/java" ]]; then
    echo "Using the Homebrew JDK at $BREW_JDK."
    export JAVA_HOME="$BREW_JDK"
    export PATH="$BREW_JDK/bin:$PATH"
  else
    echo "No Java runtime. Gradle needs a JDK 17." >&2
    echo "  brew install openjdk@17" >&2
    exit 1
  fi
fi

OUT="${GRYT_ANDROID_OUT:-$PWD/build/playstore}"
VERSION=$(node -p "require('./app.json').expo.version")
CODE=$(node -p "require('./app.json').expo.android.versionCode")

mkdir -p "$OUT"

echo "==> prebuild"
npx expo prebuild --platform android --clean

# ── Why the signing config is on the command line ───────────────────────
#
# The obvious place for it is `signingConfigs.release` in
# `android/app/build.gradle`. That does not survive: `expo prebuild` regenerates
# `android/` every run, which is the same constraint
# `plugins/withAndroidHighRefreshRate.js` exists for.
#
# A config plugin could write it, and then the passwords would be in a file that
# gets written. `android.injected.signing.*` is AGP's own hook for exactly this
# and leaves nothing behind.
echo "==> bundle: release, signed with $GRYT_ANDROID_KEY_ALIAS"
(
  cd android
  ./gradlew :app:bundleRelease \
    -Pandroid.injected.signing.store.file="$GRYT_ANDROID_KEYSTORE" \
    -Pandroid.injected.signing.store.password="$GRYT_ANDROID_KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$GRYT_ANDROID_KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$GRYT_ANDROID_KEY_PASSWORD"
)

AAB="android/app/build/outputs/bundle/release/app-release.aab"
test -f "$AAB" || { echo "Gradle reported success and produced no bundle at $AAB" >&2; exit 1; }

cp "$AAB" "$OUT/Gryt-$VERSION-$CODE.aab"
AAB="$OUT/Gryt-$VERSION-$CODE.aab"

# ── What it was actually signed with ────────────────────────────────────
#
# Asserted rather than trusted, for the reason the iOS script gives: Play
# rejects a wrongly signed bundle after the upload has finished, which is a slow
# way to learn it. An unsigned bundle is the likelier accident here — Gradle
# will happily produce one if a property is misspelled, and it says so only in
# passing.
#
# Read into a variable and matched with a herestring rather than piped into
# `grep -q`. `grep -q` exits on the first match, which closes the pipe, kills
# the writer with SIGPIPE, and makes `set -o pipefail` report 141 — so the
# condition is false precisely when the thing matched. That shipped once in
# `testflight.sh` and is not going to ship again here.
echo "==> what it was actually signed with"
CERT=$(keytool -printcert -jarfile "$AAB" 2>&1 || true)

if ! grep -q "SHA256:" <<<"$CERT"; then
  echo "    Not signed. Do not upload this." >&2
  echo "$CERT" >&2
  exit 1
fi

FINGERPRINT=$(grep -m1 "SHA256:" <<<"$CERT" | sed 's/.*SHA256: *//' | tr -d '[:space:]')
echo "    SHA-256: $FINGERPRINT"

# Optional, and worth setting once the first bundle has been accepted: Play
# shows the upload certificate's fingerprint under Setup → App integrity, and
# pinning it here turns "signed with something" into "signed with ours". A
# keystore quietly regenerated on another machine produces a valid bundle that
# Play refuses.
if [[ -n "${GRYT_ANDROID_UPLOAD_SHA256:-}" ]]; then
  EXPECTED=$(tr -d '[:space:]' <<<"$GRYT_ANDROID_UPLOAD_SHA256")

  # `tr` rather than `${x^^}`. That expansion is bash 4, and macOS ships bash
  # 3.2 as `/bin/bash`, where it is a syntax error rather than a wrong answer —
  # so it would work for whoever has Homebrew's bash first on PATH and break for
  # everybody else, which is the worst way for it to be wrong.
  UPPER=$(tr '[:lower:]' '[:upper:]' <<<"$FINGERPRINT")
  EXPECTED_UPPER=$(tr '[:lower:]' '[:upper:]' <<<"$EXPECTED")

  if [[ "$UPPER" != "$EXPECTED_UPPER" ]]; then
    echo "    Signed with the wrong key. Play would refuse this." >&2
    echo "    expected $EXPECTED" >&2
    exit 1
  fi
  echo "    ok: matches GRYT_ANDROID_UPLOAD_SHA256"
else
  echo "    (set GRYT_ANDROID_UPLOAD_SHA256 to have this checked against Play's record)"
fi

cat <<DONE

AAB:   $AAB
Build: versionCode $CODE of version $VERSION

Upload it, once the developer account is verified and the app record exists:
  See "Uploading it" in the README — it needs a service account key that
  cannot be created before then.

Then bump the version code, or the next upload is refused:
  yarn bump:build
DONE
