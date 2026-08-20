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

## What is here, and what is not

**Here:** the Expo project, `react-native-webrtc` wired through
`@config-plugins/react-native-webrtc`, and a component gallery that renders
`@gryt/ui-native` so the design system can be checked on a real screen.

**Not here yet: voice.** `@gryt/voice@0.1.1` cannot run on React Native. The
platform seam is declared but not wired — `VoicePlatform` and `SfuTransport`
are exported types that nothing in the published `dist` consumes, while the
engine calls `navigator.mediaDevices` in six files and references
`AudioWorklet` in thirteen, and constructs `RTCPeerConnection`, `AudioContext`
and `Worker` directly. Installing it here would typecheck and then fail at
runtime, so it is deliberately absent until that seam exists.

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
