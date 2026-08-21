<div align="center">
  <img src="https://raw.githubusercontent.com/Gryt-chat/client/main/public/logo.svg" width="80" alt="Gryt logo" />
  <h1>Gryt Mobile</h1>
  <p>The <a href="https://github.com/Gryt-chat/gryt">Gryt</a> client for phones, iOS and Android.<br />React Native on Expo, built on <a href="https://github.com/Gryt-chat/ui">@gryt/ui-native</a>.</p>
</div>

<br />

> **In development.** This is being built and made stable now. There is nothing
> to install yet; the desktop and web clients are the ones you can use today.

The desktop client stays Electron, and the reasoning for that is written down in
GRYT-334 rather than repeated here.

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

## Giving it to somebody else: TestFlight

`expo run:ios --device` above installs onto a phone you are holding. This is the
other thing — a build somebody across the room can install from TestFlight
without a cable.

**It needs the Apple Developer Program, 99 USD a year.** There is no free path.
A personal team can sign a build for devices you physically have and the profile
expires after seven days; it cannot upload to App Store Connect at all. Check
which one you are on at [developer.apple.com/account](https://developer.apple.com/account) —
a paid membership can create an *Apple Distribution* certificate, a free one
cannot, and that is the difference that matters here.

### Internal testers, which is what you want first

Two kinds of tester, and the distinction decides how long the first build takes
to arrive:

- **Internal** — up to 100 people, each added as a user on the App Store Connect
  team. The build is installable as soon as processing finishes, usually a few
  minutes. **No review.**
- **External** — up to 10,000 by public link, and the first build goes through
  Beta App Review. A day or two, and it is where the plist gets read properly.

For one or two people, add them as internal testers. It costs nothing beyond the
membership and skips review entirely.

### Building it

```sh
yarn testflight
```

Prebuild, archive Release, export, and check what it actually got signed with.
About fifteen minutes cold. The ipa lands in `build/testflight/export/Gryt.ipa`.

`expo run:ios` cannot stand in for this. It builds **Debug** signed for
development, and App Store Connect will not take that.

Two things about it that look wrong and are not:

- **The archive is signed for development** even though it is a Release build.
  Automatic signing picks the distribution identity at *export*, not at archive,
  so `Apple Distribution` does not appear in the archive log. The script checks
  the exported ipa rather than the archive for exactly this reason.
- **`ios/` is regenerated every run** by `prebuild --clean`. It is generated and
  gitignored, so nothing changed in Xcode survives. Anything that has to persist
  goes in `app.json`.

The team defaults to the one this ships under; `GRYT_IOS_TEAM` overrides it for
a fork.

### Uploading it, and the two things that have to exist first

Neither is in this repository and neither can be scripted the first time.

**An app record.** App Store Connect → Apps → +, bundle ID `chat.gryt.mobile`.
Without it the upload fails with *"No suitable application records were found"*
after transferring the whole ipa.

The listing name is **Gryt Chat**, not Gryt. App Store listing names are unique
across the store and `GRYT` is already taken —
[apps.apple.com/app/id6745501966](https://apps.apple.com/us/app/gryt/id6745501966),
no relation. This does not affect the app: `CFBundleDisplayName` comes from
`expo.name` and still reads **Gryt** on the home screen. Listing names do not
have to match it and are not required to be unique against anything but other
listings.

**An API key**, so nothing has to type a password. App Store Connect → Users and
Access → Integrations → App Store Connect API → Team Keys → +, role **App
Manager**. The `.p8` downloads once and never again; keep it. Then:

```sh
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_<KEY_ID>.p8 ~/.appstoreconnect/private_keys/
```

`altool` finds it there by key id, so the upload is:

```sh
xcrun altool --upload-app -t ios \
  -f build/testflight/export/Gryt.ipa \
  --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
```

Processing takes a few minutes, then the build appears under TestFlight.

### Bump the build number after every upload

```sh
yarn bump:ios
```

`ios.buildNumber` is `CFBundleVersion`. **App Store Connect refuses an upload
whose build number it has seen before**, and it refuses it after the upload has
finished rather than before it starts — so on a 34 MB ipa you wait for the whole
transfer to be told.

`version` is the one people see (`0.1.0`) and is bumped by hand when it means
something. `buildNumber` only has to go up.

### Two things in the plist that App Review will ask about

Neither matters for internal testing. Both come up the first time a build goes to
external testers or the App Store.

- **`NSAppTransportSecurity.NSAllowsArbitraryLoads`** is on, and Apple wants a
  reason. The honest one: Gryt servers are self-hosted and the user types the
  address, so plenty of them are plain HTTP on a LAN. That is the same reason
  `NSLocalNetworkUsageDescription` is there. Put it in the review notes rather
  than trying to narrow the exception — there is no fixed domain to narrow it to.
- **`ITSAppUsesNonExemptEncryption` is declared `false`**, which is what stops
  every single upload asking about export compliance. The app uses HTTPS and
  WebRTC's DTLS-SRTP and nothing else, which is the standard-cryptography
  exemption. If Gryt ever ships its own crypto — the identity keypair is the
  thing to watch — this stops being true and has to change.

### `voip` was in `UIBackgroundModes` and is not any more

It was declared next to `audio` and nothing in the app used it. Since iOS 13 an
app claiming the `voip` background mode is expected to receive calls through
PushKit and report them to CallKit; there is no PushKit here, no CallKit, and no
dependency on either. So it did nothing at runtime and was a documented rejection
reason waiting for the first review.

`audio` is the one that does the work — it is what keeps capture and playback
alive while the app is backgrounded during a call, and it stayed.

`voip` goes back the day an incoming call has to wake the phone, together with
the PushKit and CallKit that make the claim true.

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

The navbar is **ours**, on `expo-router/ui`. Three items, and they never change
— Server, Search, You. All three are routes, and all three are pages you can
drag between.

It used to be native, and the reason it is not any more is height. `UITabBar` is
62pt inside an 83pt container, neither is settable, `CGAffineTransform` on the
bar does not move the container behind it, and iOS 26 has no API for a compact
bar that keeps every icon visible — `UITabBarMinimizeBehavior` says *when* a bar
collapses, never *what* it looks like. The reference this is measured against is
not a `UITabBarController` either. GRYT-458 has the whole argument.

The root is a **Stack around the tabs** rather than the tab bar itself, so a
screen can be pushed over the bar.

One thing sits beside the tabs rather than inside a screen, because it is
reachable from the bar and has to cover it: **the server switcher**, a drawer
from the left. Every server, then "Add a server", then Discovery — the desktop
client's rail, which a phone has no room to keep permanently on screen. Opened
by the header on the Server screen.

### Three things about the navbar that are not obvious

**The glass is real, and it is not `@expo/ui`.** `GlassEffectContainer` there
hosts SwiftUI children and the bar's are React Native pressables, which is why
the bar shipped on `expo-blur` first. `expo-glass-effect`'s `GlassView` is a
`UIVisualEffectView` carrying a `UIGlassEffect` — an ordinary `UIView` that
takes ordinary children — so the bar uses that, and falls back to the blur
wherever `isLiquidGlassAvailable()` says no: Android, iOS before 26, and a phone
whose owner turned the effect off in accessibility settings.

**The selection capsule reads the pager, not the route.** `TabPager` writes
where the row is, in pages and continuously, into a shared value the bar reads
— so dragging between pages drags the capsule with it rather than snapping when
the route changes on release. It stretches on the way, longest halfway between
two slots, which is what makes iOS 26's own bar read as liquid rather than as a
sliding rectangle.

The route still changes only **on release**, after the row settles on the
nearest page. Anything else flickers the header and the bar through states you
are only passing over, and a drag you abandoned would still have navigated.

**You is a page, not a sheet.** It was one until GRYT-471, and being one meant
the bar had to interpolate its capsule towards a slot the pager knew nothing
about, the layout kept a `youOpen` flag beside the route as a second answer to
which tab you were on, and the sheet covered the bar it was opened from — so
while You was showing, the thing marking You as selected was off screen.

### It needs `@gryt/ui-native` 0.5.0

The shell drives its sheets with `open`, and its drawer does not pad its own
safe area, because the component does. Both of those land in 0.5.0; against
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


## Sponsors

What sponsoring pays for, the tiers, and everyone who has sponsored:
[gryt.chat/sponsors](https://gryt.chat/sponsors). To sponsor:
[GitHub Sponsors](https://github.com/sponsors/Gryt-chat).

The list itself lives in the [Gryt README](https://github.com/Gryt-chat/gryt#sponsors),
in one place rather than ten, so it cannot fall out of step across repositories.

## License

[AGPL-3.0](https://github.com/Gryt-chat/gryt/blob/main/LICENSE) — Part of [Gryt](https://github.com/Gryt-chat/gryt)

The `@gryt/ui-native` components it renders are MIT, which is the one exception
across the project and is explained in [that repository](https://github.com/Gryt-chat/ui).
