#!/usr/bin/env bash
#
# Build a TestFlight-ready IPA.
#
# `expo run:ios` cannot do this. It builds Debug signed for development, and
# App Store Connect will not take that. This archives Release and re-signs on
# export with the App Store distribution certificate — a different certificate
# and a different profile, both created automatically the first time, because
# Xcode is signed in to the team.
#
# It does not upload. That needs an App Store Connect API key and an app record
# that already exists; see "Uploading it" in the README.
set -euo pipefail

# Not a secret. A team ID is in the signature of every app Apple ships and
# `codesign -dvvv` prints it. Overridable so a fork can build under its own.
TEAM="${GRYT_IOS_TEAM:-8883W2XTQ8}"
OUT="${GRYT_IOS_OUT:-$PWD/build/testflight}"
ARCHIVE="$OUT/Gryt.xcarchive"

# CocoaPods reads its own path and dies on "Unicode Normalization not
# appropriate for ASCII-8BIT" when the shell has no UTF-8 locale — usual in CI
# or under an agent, unusual in a terminal.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

VERSION=$(node -p "require('./app.json').expo.version")
BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")

mkdir -p "$OUT"

echo "==> prebuild"
npx expo prebuild --platform ios --clean

# ── Talking to Apple from somewhere that is not your Mac ────────────────
#
# `-allowProvisioningUpdates` asks App Store Connect for a profile, and on a
# laptop Xcode is already signed in so it just works. A CI runner is signed in
# to nothing, and the failure is a provisioning error that says nothing about
# authentication.
#
# So when the three App Store Connect variables are present, they are handed to
# xcodebuild; when they are not, nothing changes and the Xcode session is used
# as before. Empty by design — this is the same script in both places.
# `${A[@]+"${A[@]}"}` rather than `"${A[@]}"` below. macOS ships bash 3.2, where
# expanding an *empty* array under `set -u` is an unbound-variable error rather
# than nothing — so the plain form works for whoever has Homebrew's bash first
# on PATH and breaks for everybody else. Same trap as the `tr` note further
# down.
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

echo "==> archive: Release, team $TEAM"
xcodebuild \
  -workspace ios/Gryt.xcworkspace \
  -scheme Gryt \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM" \
  -allowProvisioningUpdates \
  ${ASC_ARGS[@]+"${ASC_ARGS[@]}"} \
  archive

# The archive comes out signed for *development* even though it is a Release
# build. That is expected: automatic signing picks the distribution identity at
# export, not at archive. Do not go hunting for "Apple Distribution" in the
# archive log — it is not there and nothing is wrong.

# ── Which distribution certificate the export uses ──────────────────────
#
# Left unset, this asks for whatever automatic signing decides, which on a Mac
# signed in to the team means Apple's *cloud-managed* distribution certificate.
# Apple holds that private key and signs on request, so there is nothing in the
# keychain to find — `security find-identity` on a laptop that has shipped
# dozens of builds lists no distribution identity at all, and that is normal.
#
# It is also why CI needs this knob. Cloud signing is authorised by the Xcode
# session, and an App Store Connect key may only stand in for it when the key
# has the Admin role; an App Manager key gets "Cloud signing permission error"
# and an export that names a certificate it cannot see. Setting this to
# `Apple Distribution` points the export at an identity in the keychain
# instead, which is what the workflow imports a .p12 for.
SIGNING_CERT_LINE=""
if [[ -n "${GRYT_IOS_SIGNING_CERT:-}" ]]; then
  SIGNING_CERT_LINE="  <key>signingCertificate</key><string>$GRYT_IOS_SIGNING_CERT</string>"
  echo "    exporting with the certificate $GRYT_IOS_SIGNING_CERT"
fi

# ── Automatic signing is not enough on a runner ─────────────────────────
#
# A certificate in the keychain gets the export past "no signing certificate"
# and straight into
#
#     error: exportArchive Cloud signing permission error
#     error: exportArchive No profiles for 'chat.gryt.mobile' were found
#
# because automatic signing asks App Store Connect for the profile through
# cloud signing, which is the one thing an App Manager key may not do. Making
# the profiles through the API is a different operation and is allowed, so
# `scripts/ios-profiles.mjs` creates and installs them and hands the mapping
# here as JSON. With it, the export signs manually and Apple is not asked to
# sign anything.
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

# Asserted rather than trusted. An export that quietly produced a
# development-signed ipa is rejected by App Store Connect *after* the upload
# finishes, which is a slow and confusing way to learn it.
echo "==> what it was actually signed with"
rm -rf "$OUT/verify"
unzip -qo "$IPA" -d "$OUT/verify"

# Read into a variable and match with a herestring rather than piping into
# `grep -q`, which is wrong here in a way that is worth spelling out because it
# passes review by eye.
#
# `grep -q` exits the moment it matches. That closes the pipe, `codesign` is
# killed by SIGPIPE, and `set -o pipefail` reports the pipeline as 141 — so the
# condition is *false precisely when the thing matched*. This shipped in the
# first version of this script and refused a correctly signed ipa, printing the
# `Authority=Apple Distribution` line it had just decided was absent.
#
# `codesign` writes to stderr, hence 2>&1, and `|| true` because it is allowed
# to fail here; failing to read a signature is handled below as "not signed"
# rather than as a crash.
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
