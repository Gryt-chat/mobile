# Gryt mobile

The Gryt client for phones. React Native on Expo, iOS and Android only — the
desktop client stays Electron, and the reasoning for that is written down in
GRYT-334 rather than repeated here.

AGPL-3.0, like the other Gryt apps. The UI packages it consumes are MIT.

## Running it

```sh
yarn install
npx expo prebuild --platform ios
npx expo run:ios
```

`ios/` and `android/` are generated and gitignored. This is a prebuild project,
not a bare one — change `app.json` and regenerate rather than editing Xcode
settings by hand, or the next `prebuild` will throw the edit away.

It is a **dev client**, not Expo Go: `react-native-webrtc` is a native module
and Expo Go cannot load it. `npx expo start` alone will not open the app; run
the dev client build and point it at the bundler.

## Running it on a real phone

Do this rather than reaching for the simulator, because most of what this app
raises has no simulator answer. **A simulator reports 60 Hz whatever the plist
says**, so GRYT-377 and `src/FrameProbe.tsx` mean nothing there. Neither does
the microphone permission prompt, audio routing to a headset, or the codec
question in GRYT-335.

### iOS

```sh
npx expo run:ios --device
```

With no argument it lists the phones it can see and asks. To skip the prompt,
pass the UDID — and it has to be the UDID, not the identifier `devicectl`
prints, which is a different number that Expo rejects with "No device UDID or
name matching":

```sh
xcrun xctrace list devices     # the value in parentheses, 00008150-000E...
```

Four things have to be true, and three of them announce themselves badly:

- **Developer Mode on.** Settings → Privacy & Security → Developer Mode, then
  reboot. The toggle only appears once the phone has been connected to Xcode or
  had an install attempted, so on a fresh phone it is not there to find until
  you have already tried once.
- **A signing team.** Automatic signing handles the rest — Expo passes
  `-allowProvisioningUpdates -allowProvisioningDeviceRegistration`, so the
  profile for `chat.gryt.mobile` is created and the phone registered without
  anyone opening Xcode. A free personal team works too, with a seven-day
  profile: the app stops opening after a week and has to be rebuilt.
- **The phone unlocked, and kept unlocked** through the build. This is the one
  that wastes an afternoon. Locking it produces `xcodebuild: error: Timed out
  waiting for all destinations matching the provided destination specifier to
  become available`, which says nothing about a lock; the real reason is on the
  line below it, as either "may need to be unlocked to recover from previously
  reported preparation errors" or "The developer disk image could not be
  mounted on this device". Both mean unlock the phone.
- **The certificate trusted**, the first time only: Settings → General → VPN &
  Device Management → the developer certificate → Trust.

Then start the bundler and let the dev client find it over the LAN:

```sh
npx expo start --dev-client
```

Wired and wireless both work. Wireless needs the phone on the same network with
"Connect via network" ticked for it in Xcode's Devices window, and is slower to
install.

### Android

```sh
npx expo run:android --device
```

Developer options, then USB debugging, then accept the RSA prompt on the phone.
No signing story — a debug build is self-signed, so there is nothing to set up
and nothing that expires.

### If CocoaPods dies on an encoding error

`pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT
(Encoding::CompatibilityError)` when the shell has no UTF-8 locale, which is
usual in a CI runner or under an agent and unusual in a terminal. It is
CocoaPods reading its own path, not anything about this project:

```sh
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios
```

## What is here, and what is not

**Here:** the Expo project, `react-native-webrtc` wired through
`@config-plugins/react-native-webrtc`, and a component gallery that renders
`@gryt/ui-native` so the design system can be checked on a real screen.

**Not here yet: voice.** `@gryt/voice@0.1.1` cannot run on React Native. The
platform seam is declared but not wired — `VoicePlatform` and `SfuTransport`
are exported types that nothing in the published `dist` consumes, while the
engine calls `navigator.mediaDevices` in six files and references
`AudioWorklet` in thirteen, and constructs `RTCPeerConnection`, `AudioContext`
and `Worker` directly. It is deliberately absent until that seam exists.

It does not get as far as runtime, which is worth writing down because it is
not what the file counts above suggest. Installing 0.1.1 here and importing
anything from it fails **in Metro**, after 1167 modules, with `Unable to
resolve module @shiguredo/rnnoise-wasm`. The chain is `useMicrophone` →
`rnnoiseProcessor` → `rnnoiseWorker`: Metro treats `new Worker(new
URL("./rnnoiseWorker.js", import.meta.url))` as a dependency and follows it,
and the worker imports a package that is a devDependency of `@gryt/voice` and
therefore not shipped. `import.meta.url` itself is fine — Metro parses it
without complaint, which was the thing everyone expected to break.

So the fix is not a runtime guard. Nothing web-only may be *reachable* from
what a phone imports, whether or not it is ever called. GRYT-385 covers it.

The WebRTC native module is wired anyway, because it is what the GRYT-335
spike needs and because finding out late that the plugin does not build is
worse than finding out now. It does build.

## The component catalogue

`src/dev/` is the dev surface: an index of every `@gryt/ui-native` component and
a page per component, each showing the states worth having an opinion about —
tones, sizes, disabled, long labels. It is a harness for feedback, not a product
screen, and the real screens replace it.

It is not built on a navigation library. The app will need one, and which one is
a decision that should be made for the app rather than settled in passing by a
test harness; two screens and a back button do not justify choosing today.

### What it has already found

The library had 33 components and none had ever been drawn on a device — the
only coverage was vitest over the token maths, which cannot tell you whether a
ramp resolves, an overlay lands where it should, or a drag tracks your finger.

Real bugs:

- **Slider ran away from your finger** when dragged, while tapping was fine.
  `gesture.dx` is cumulative, and the handler added it to the live value every
  event, so the error compounded. GRYT-378.
- **Dialog clips its own footer.** `Popup` wraps children in a `ScrollView` by
  default, and a ScrollView inside a content-sized parent has no height to
  measure against. `scrollable={false}` renders correctly; the default does not.
  GRYT-379.

Misuse worth knowing before writing real screens:

- **Every `Trigger` and `Close` is itself a `Pressable`.** Nesting a `Button`
  inside one means the inner pressable wins the touch and the overlay never
  opens, silently. Trigger children have to be plain visual content — `Row.tsx`
  has a `TriggerLabel` for exactly this.
- `Meter` is a 0–100 scale by default, not a 0–1 ratio. Passing `0.71` renders
  an almost-empty bar reading "1".
- `Tabs` needs its `Tabs.List` wrapper to lay triggers out in a row. Putting
  `Tab` directly inside `Tabs` stacks them vertically with no error.

## Frame rate

The app asks for the highest refresh rate the hardware offers, on both
platforms. Neither is automatic.

**iOS caps third-party apps at 60 fps on ProMotion displays** unless
`CADisableMinimumFrameDurationOnPhone` is set. It is in `app.json` under
`ios.infoPlist`. Without it a 120 Hz iPhone renders this UI at 60 no matter how
well it is written, and nothing about that looks broken — it just is not what
the panel can do.

**Android has no equivalent single switch.** Most devices give a full-screen app
the panel's top rate on their own; plenty of OEM skins hold at 60 until the
window asks. `plugins/withAndroidHighRefreshRate.js` asks, by setting
`preferredDisplayModeId` in `MainActivity.onCreate`.

It picks the fastest mode *at the current resolution* rather than the fastest
mode outright. `supportedModes` mixes resolutions, and several phones list their
highest refresh only on a lower-resolution mode — taking the fastest would
quietly drop the display to 1080p.

It is a config plugin rather than an edit to `android/` because `android/` is
generated. A hand edit survives until the next `expo prebuild` and then
disappears, taking the frame rate with it and telling nobody.

## Keeping frames off the JS thread

Config only raises the ceiling. What keeps you near it:

- `react-native-reanimated` — animations as worklets on the UI thread. The
  babel plugin in `babel.config.js` is what makes worklets exist; without it
  everything silently falls back to the JS thread and drops frames under load
  rather than erroring.
- `react-native-gesture-handler` — same argument for touch. `App.tsx` wraps the
  tree in `GestureHandlerRootView`, which Android requires and iOS does not,
  so a missing one ships broken on exactly one platform.
- `@shopify/flash-list` for anything long. On a chat client that means the
  message list and the member list.

`src/FrameProbe.tsx` runs a UI-thread animation and reports measured fps, so
"is this actually 120?" has an answer on the device rather than an opinion.
**A simulator reports 60 whatever the plist says** — measured, not assumed —
so the number only means something on real hardware.

## The New Architecture question, which is not settled

Expo SDK 57 runs the New Architecture by default and gives no supported way to
turn it off — `newArchEnabled` was removed from the config schema, and setting
it does nothing (it was in this repo's first commit and produced no entry in
`Podfile.properties.json`).

**`react-native-webrtc` is listed as untested on the New Architecture** by React
Native Directory. Not broken, not unmaintained — 4,986 stars and current
releases — just unverified on the renderer this app is already running.

It builds and the app launches. What that does *not* prove is that a call works,
because nothing here places one yet. That question belongs to GRYT-335.

`expo-doctor`'s directory check is excluded for this one package in
`package.json` so CI stays useful for everything else. The exclusion is not a
judgement that the warning is wrong — it is here so the warning does not become
background noise that hides the next one. If the spike finds the New
Architecture is the problem, `@livekit/react-native-webrtc` is a maintained fork
that *is* marked as tested, at 25 stars against 4,986.
