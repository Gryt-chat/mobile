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

echo "==> archive: Release, team $TEAM"
xcodebuild \
  -workspace ios/Gryt.xcworkspace \
  -scheme Gryt \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM" \
  -allowProvisioningUpdates \
  archive

# The archive comes out signed for *development* even though it is a Release
# build. That is expected: automatic signing picks the distribution identity at
# export, not at archive. Do not go hunting for "Apple Distribution" in the
# archive log — it is not there and nothing is wrong.
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
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
  -allowProvisioningUpdates

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
