#!/usr/bin/env bash
#
# Build a Play-ready Android App Bundle — the Android half of `testflight.sh`. It
# asserts what it produced, and does not upload; `yarn playstore:upload` does.
set -euo pipefail

# ── The upload key ──────────────────────────────────────────────────────
#
# Two keys, not one: Google holds the *app signing* key and we hold an *upload* key.
# Losing the upload key is recoverable; losing the app signing key is not.
#
: "${GRYT_ANDROID_KEYSTORE:?set it to the .jks path, e.g. ~/.gryt/gryt-upload.jks}"
: "${GRYT_ANDROID_KEYSTORE_PASSWORD:?the keystore password}"
: "${GRYT_ANDROID_KEY_ALIAS:?the key alias, e.g. gryt-upload}"
: "${GRYT_ANDROID_KEY_PASSWORD:?the key password}"

if [[ ! -f "$GRYT_ANDROID_KEYSTORE" ]]; then
  echo "No keystore at $GRYT_ANDROID_KEYSTORE." >&2
  echo "See the keytool command in the comment at the top of this script." >&2
  exit 1
fi

# Gradle needs a JDK and macOS does not ship one. `/usr/bin/java` is a stub that sends
# you to java.com; the answer is that Homebrew put it somewhere not on `PATH`.
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
# `signingConfigs.release` does not survive `expo prebuild`, and a plugin writing it would
# put the passwords in a generated file. `android.injected.signing.*` leaves nothing.
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
# Asserted, not trusted: Play rejects a wrongly signed bundle after the upload. Read into
# a variable, since `grep -q` exits on match and `pipefail` then reports 141.
echo "==> what it was actually signed with"
CERT=$(keytool -printcert -jarfile "$AAB" 2>&1 || true)

if ! grep -q "SHA256:" <<<"$CERT"; then
  echo "    Not signed. Do not upload this." >&2
  echo "$CERT" >&2
  exit 1
fi

FINGERPRINT=$(grep -m1 "SHA256:" <<<"$CERT" | sed 's/.*SHA256: *//' | tr -d '[:space:]')
echo "    SHA-256: $FINGERPRINT"

# Optional, and worth setting once the first bundle is accepted: pinning the upload
# certificate's fingerprint turns "signed with something" into "signed with ours".
if [[ -n "${GRYT_ANDROID_UPLOAD_SHA256:-}" ]]; then
  EXPECTED=$(tr -d '[:space:]' <<<"$GRYT_ANDROID_UPLOAD_SHA256")

  # `tr` rather than `${x^^}`, which is bash 4 — macOS ships 3.2 as `/bin/bash`, where
  # it is a syntax error rather than a wrong answer.
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

Upload it:
  yarn playstore:upload "$AAB"

Then bump the version code, or the next upload is refused:
  yarn bump:build
DONE
