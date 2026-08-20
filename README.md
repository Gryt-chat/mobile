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

## The gallery

`src/Gallery.tsx` renders every `@gryt/ui-native` component that works without
a server behind it. It is a harness, not a product screen, and the real screens
replace it.

It earns its place: the component library had 33 components and none of them
had ever been drawn on a device — the only coverage was vitest over the token
maths, which cannot tell you whether a ramp resolves, an overlay lands where it
should, or a long press opens a tooltip.

Two things it caught immediately, both misuse rather than library bugs, and
both worth knowing before writing real screens:

- `Meter` is a 0–100 scale by default, not a 0–1 ratio. Passing `0.71` renders
  an almost-empty bar reading "1".
- `Tabs` needs its `Tabs.List` wrapper to lay triggers out in a row. Putting
  `Tab` directly inside `Tabs` stacks them vertically with no error.
