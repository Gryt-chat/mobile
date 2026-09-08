#!/usr/bin/env bash
#
# Build a TestFlight-ready IPA. `expo run:ios` cannot: it builds Debug signed for
# development. This archives Release and re-signs on export. It does not upload.
set -euo pipefail

# Not a secret. A team ID is in the signature of every app Apple ships and
# `codesign -dvvv` prints it. Overridable so a fork can build under its own.
TEAM="${GRYT_IOS_TEAM:-8883W2XTQ8}"
OUT="${GRYT_IOS_OUT:-$PWD/build/testflight}"
ARCHIVE="$OUT/Gryt.xcarchive"

# CocoaPods dies on "Unicode Normalization not appropriate for ASCII-8BIT" when the
# shell has no UTF-8 locale — usual in CI, unusual in a terminal.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

VERSION=$(node -p "require('./app.json').expo.version")
BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")

mkdir -p "$OUT"

echo "==> prebuild"
npx expo prebuild --platform ios --clean

# ── Talking to Apple from somewhere that is not your Mac ────────────────
#
# `-allowProvisioningUpdates` asks App Store Connect for a profile, which a laptop's
# Xcode session covers and a runner's nothing does. The three variables are handed
# to xcodebuild when present and empty otherwise, so this is one script for both.
#
# `${A[@]+"${A[@]}"}` rather than `"${A[@]}"`: macOS ships bash 3.2, where expanding
# an empty array under `set -u` is an unbound-variable error.
ASC_ARGS=()
if [[ -n "${GRYT_IOS_ASC_KEY_PATH:-}" ]]; then
  : "${GRYT_IOS_ASC_KEY_ID:?set it alongside GRYT_IOS_ASC_KEY_PATH}"
  : "${GRYT_IOS_ASC_ISSUER_ID:?set it alongside GRYT_IOS_ASC_KEY_PATH}"
  if [[ ! -f "$GRYT_IOS_ASC_KEY_PATH" ]]; then
    echo "No .p8 at $GRYT_IOS_ASC_KEY_PATH." >&2
    exit 1
  fi
  ASC_ARGS=(
    -authenticationKeyPath "$GRYT_IOS_ASC_KEY_PATH"
    -authenticationKeyID "$GRYT_IOS_ASC_KEY_ID"
    -authenticationKeyIssuerID "$GRYT_IOS_ASC_ISSUER_ID"
  )
  echo "    using the App Store Connect key $GRYT_IOS_ASC_KEY_ID"
fi

# ── Signing the archive is wasted work, and on CI it litters ────────────
#
# The export re-signs everything, and automatic signing does not know that — on a
# runner it asks for a *new* development certificate every release, and an Apple
# account holds a limited number. So with a profile map the archive does not sign.
ARCHIVE_ARGS=(-allowProvisioningUpdates ${ASC_ARGS[@]+"${ASC_ARGS[@]}"})
if [[ -n "${GRYT_IOS_PROFILE_MAP:-}" ]]; then
  ARCHIVE_ARGS=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)
  echo "    archiving unsigned; the export signs it"
fi

echo "==> archive: Release, team $TEAM"
xcodebuild \
  -workspace ios/Gryt.xcworkspace \
  -scheme Gryt \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM" \
  ${ARCHIVE_ARGS[@]+"${ARCHIVE_ARGS[@]}"} \
  archive

# On a laptop the archive comes out signed for *development* even though it is a
# Release build. Automatic signing picks the distribution identity at export.

# ── Which distribution certificate the export uses ──────────────────────
#
# Left unset this asks for whatever automatic signing decides, which on a Mac signed
# in to the team is Apple's cloud-managed certificate — nothing in the keychain to
# find. CI needs the knob because cloud signing wants an Admin-role key, and Gryt's
# is App Manager; `Apple Distribution` points the export at the imported .p12.
SIGNING_CERT_LINE=""
if [[ -n "${GRYT_IOS_SIGNING_CERT:-}" ]]; then
  SIGNING_CERT_LINE="  <key>signingCertificate</key><string>$GRYT_IOS_SIGNING_CERT</string>"
  echo "    exporting with the certificate $GRYT_IOS_SIGNING_CERT"
fi

# ── Automatic signing is not enough on a runner ─────────────────────────
#
# A certificate gets the export past "no signing certificate" and into "No profiles
# for 'chat.gryt.mobile' were found", because automatic signing asks for the profile
# through cloud signing. `scripts/ios-profiles.mjs` makes them over the API instead
# and hands the mapping here as JSON, so the export signs manually.
SIGNING_STYLE="automatic"
PROFILE_LINES=""
if [[ -n "${GRYT_IOS_PROFILE_MAP:-}" ]]; then
  SIGNING_STYLE="manual"
  PROFILE_LINES=$(node -e '
    const map = JSON.parse(process.env.GRYT_IOS_PROFILE_MAP);
    const out = ["  <key>provisioningProfiles</key>", "  <dict>"];
    for (const [bundle, name] of Object.entries(map)) {
      out.push(`    <key>${bundle}</key><string>${name}</string>`);
    }
    out.push("  </dict>");
    console.log(out.join("\n"));
  ')
  echo "    exporting manually against $(node -e 'console.log(Object.keys(JSON.parse(process.env.GRYT_IOS_PROFILE_MAP)).length)') profiles"
fi

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>$SIGNING_STYLE</string>
$SIGNING_CERT_LINE
$PROFILE_LINES
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

echo "==> export"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  -allowProvisioningUpdates \
  ${ASC_ARGS[@]+"${ASC_ARGS[@]}"}

IPA="$OUT/export/Gryt.ipa"

# Asserted rather than trusted: an export that quietly produced a development-signed
# ipa is rejected by App Store Connect *after* the upload finishes.
echo "==> what it was actually signed with"
rm -rf "$OUT/verify"
unzip -qo "$IPA" -d "$OUT/verify"

# Read into a variable and matched with a herestring rather than piped into `grep -q`,
# which exits on match, kills `codesign` with SIGPIPE and — under `set -o pipefail` —
# reports 141, so the condition is false precisely when the thing matched.
#
# `codesign` writes to stderr, hence 2>&1, and `|| true` because failing to read a
# signature is handled below as "not signed".
SIGNING=$(codesign -dvvv "$OUT/verify/Payload/Gryt.app" 2>&1 || true)

if grep -q "^Authority=Apple Distribution" <<<"$SIGNING"; then
  echo "    ok: Apple Distribution"
else
  echo "    NOT distribution-signed. Do not upload this." >&2
  grep "^Authority=" <<<"$SIGNING" >&2 || echo "    (no signature at all)" >&2
  exit 1
fi
rm -rf "$OUT/verify"

cat <<DONE

IPA:   $IPA
Build: $BUILD of version $VERSION

Upload it:
  xcrun altool --upload-app -t ios -f "$IPA" \
    --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>

Then bump the build numbers, or the next upload is refused:
  yarn bump:build
DONE
