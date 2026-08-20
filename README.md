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

## After pulling: rebuild if native modules changed

`npx expo start` alone is not enough when a change adds a native module. The
bundler will happily serve JS that imports one the installed app does not have,
and it fails at runtime as **"Cannot find native module <Name>"** — which reads
like a broken bundler and is a stale binary.

```sh
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

It has happened three times so far and each one cost a full rebuild to work out:

- **`expo-router`** brought in `expo-linking`, `expo-constants` and
  `react-native-screens` → `Cannot find native module ExpoLinking`.
- **`react-native-svg`** bundled fine and drew every icon as a red "Un" box.
- **`react-native-safe-area-context`** bundled fine and returned **zero**
  insets, which looks exactly like a layout bug rather than a missing
  dependency.

Only the first announces itself as a missing module. The other two look like
your code is wrong.

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
`@config-plugins/react-native-webrtc`, the app shell, and a component gallery
that renders `@gryt/ui-native` so the design system can be checked on a real
screen.

**Not here yet: voice.** The voice view is a mockup with fake participants and
nothing is wired to `@gryt/voice`.

The reason is a release rather than a design now. The platform seam is built —
GRYT-385 wired it and GRYT-389 moved the audio graph behind it, both merged —
but npm still serves `@gryt/voice@0.1.1`, which is from before either. A React
Native app installs `@gryt/voice/native`, and 0.1.1 has no such entry.

What 0.1.1 does when you try is worth keeping written down, because it is not
what reading the source suggests. Importing anything from it fails **in
Metro**, after 1167 modules, with `Unable to resolve module
@shiguredo/rnnoise-wasm`. The chain is `useMicrophone` → `rnnoiseProcessor` →
`rnnoiseWorker`: Metro treats `new Worker(new URL("./rnnoiseWorker.js",
import.meta.url))` as a dependency and follows it, and the worker imports a
package that is a devDependency of `@gryt/voice` and therefore not shipped.
`import.meta.url` itself is fine — Metro parses it without complaint, which was
the thing everyone expected to break.

So the fix was never a runtime guard. Nothing web-only may be *reachable* from
what a phone imports, whether or not it is ever called, and that is what the
seam does.

The WebRTC native module is wired anyway, because it is what the GRYT-335
spike needs and because finding out late that the plugin does not build is
worse than finding out now. It does build.

## The component catalogue

`src/dev/` is the dev surface: an index of every `@gryt/ui-native` component and
a page per component, each showing the states worth having an opinion about —
tones, sizes, disabled, long labels. It is a harness for feedback, not a product
screen, which is why it is not in the navbar — it is reached from the "you"
sheet, behind a `__DEV__` check, where the desktop client puts its own developer
section.

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

## The shell

`app/` is file-based routing, on `expo-router`. `app/_layout.tsx` holds
everything `App.tsx` used to — the providers, the theme, the gesture root — and
a Stack; `app/(tabs)/_layout.tsx` holds the navbar.

The navbar is native: a real `UITabBar` on iOS, Material bottom navigation on
Android. Three items, and they never change — Server, Search, You.

The root is a **Stack around the tabs** rather than the tab bar itself, so a
screen can be pushed over the bar. Native tabs cannot nest in native tabs, and
there is no way to present a full-screen route above the bar without a Stack
ancestor, so a tab-bar root would have to be unpicked the first time something
needed to cover it.

Two things sit beside the tabs rather than inside a screen, because both are
reachable from the bar and both have to cover it:

- **The server switcher**, a drawer from the left. Every server, then "Add a
  server", then Discovery — the desktop client's rail, which a phone has no room
  to keep permanently on screen. Opened by the header on the Server screen.
- **The "you" sheet**, behind the avatar. The desktop client's avatar menu and
  its mini controls, in that client's order.

### Two things about the navbar that are not obvious

**Tab icons cannot be Phosphor.** The native bar takes an SF Symbol, an xcasset,
an Android drawable, a Material glyph, or an image source — and for a React
element, only a `VectorIcon` whose family exposes `getImageSource`. Anything
else is dropped with a console warning and no icon. Phosphor is
`react-native-svg` components and has no such method, so the bar uses `sf` and
`md` while the rest of the app goes on using Phosphor.

That is not a compromise. Declining `@expo/ui` for the design system carved out
"things that should feel native and have no Gryt look", and a tab bar is exactly
that case.

**A tab press cannot be cancelled.** `tabPress` is declared
`canPreventDefault: false` — a listener is told after the fact and the bar has
already switched. So the avatar tab, which opens a sheet rather than going
anywhere, is `disabled`: the navigator emits `tabPress` with `isPrevented` and
returns without advancing, so the tap is heard and nothing moves. The item does
not render dimmed. `app/(tabs)/you.tsx` exists because a trigger has to name a
route that exists, and is never shown.

### It needs `@gryt/ui-native` 0.5.0

The shell drives both of its sheets with `open`, and its drawer does not pad its
own safe area, because the component does. Both of those land in 0.5.0; against
0.4.0 the sheets never open and the drawer's first row sits under the clock.

`yarn install` here before that is published gets 0.4.0 and an app that looks
broken in two specific ways rather than failing to build.

### Context does not survive the sheet

`@gorhom/portal` renders a sheet's children in a different React tree, and React
context does not cross that. `useShell` inside `Sheet.Content` throws "must be
used inside ShellProvider" from a component that visibly is inside one, so
everything a sheet body needs is read outside and passed down as props.

`useTheme` works only because `@gryt/ui-native` re-provides it on the far side of
the portal. A sheet of plain text never shows any of this, which is how it would
ship.

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
- `react-native-gesture-handler` — same argument for touch.
  `app/_layout.tsx` wraps the tree in `GestureHandlerRootView`, which Android
  requires and iOS does not, so a missing one ships broken on exactly one
  platform.
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
