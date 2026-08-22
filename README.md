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
`@config-plugins/react-native-webrtc`, the app shell, a component gallery that
renders `@gryt/ui-native` so the design system can be checked on a real screen,
and **voice** — a phone joins a real room, publishes a real stream and holds a
call.

Voice was a mockup for a while, and the reason was a release rather than a
design: the platform seam was built before npm served a `@gryt/voice` that had
`@gryt/voice/native` in it. What the old version did when you tried is worth
keeping written down, because it is not what reading the source suggests.
Importing anything from it failed **in Metro**, after 1167 modules, with
`Unable to resolve module @shiguredo/rnnoise-wasm`. The chain was
`useMicrophone` → `rnnoiseProcessor` → `rnnoiseWorker`: Metro treats
`new Worker(new URL("./rnnoiseWorker.js", import.meta.url))` as a dependency and
follows it, and the worker imports a package that is a devDependency of
`@gryt/voice` and therefore not shipped. `import.meta.url` itself was fine —
Metro parses it without complaint, which was the thing everyone expected to
break.

So the fix was never a runtime guard. Nothing web-only may be *reachable* from
what a phone imports, whether or not it is ever called, and that is what the
seam does.

**Not here yet:** camera and screen capture, search, uploads, and voice
messages. **None of them have a button.**

They used to. Camera and screen share sat in the voice control row and on the
You page, attach and voice-message sat in the composer, and search had a field
and six filter chips — and every one of those either moved a flag nothing read
or had no `onPress` at all. The argument for keeping them was that a surface
should not change shape when a feature lands. That is the wrong trade: a
control that responds to a press and does nothing costs a tap to find out, and
then it costs trust in the controls beside it that do work. GRYT-488 took the
lot out.

The rule going forward is the one the composer's send button already follows:
a control exists when there is something behind it.

### `modules/audio-route`

A local Expo module, iOS only, over `AVAudioSession`: what the call is coming
out of, what else it could come out of, and how to move it. It exists because
`react-native-webrtc` has no route API — `RTCAudioSession` is two CallKit hooks
and nothing else — so without it a call plays out of the earpiece and there is
no way to say otherwise.

It does **not** own the session. WebRTC configures and activates it, and
everything in the module assumes that has already happened;
`overrideOutputAudioPort` throws outside `playAndRecord`, which is exactly the
state before a call has started.

The asymmetry worth knowing: the speaker and the earpiece are set on the
*output*, and a headset or a car is set on the **input**. `setPreferredInput`
moves the whole route, and `overrideOutputAudioPort` only knows `.speaker` and
`.none` — which is why the list of things you can pick is read from
`availableInputs`.

Android is GRYT-470. The JS side returns an empty list there rather than
throwing, so the picker says there is nothing to choose rather than failing to
open.

### `modules/lan-discovery`

The other local Expo module, also iOS only, over `NWBrowser`: Gryt servers
advertising themselves on the network you are on. The server has published
itself as `_gryt._tcp` with a `server_id` in its TXT record since GRYT-227, and
the desktop client has browsed for it since — this is the phone's side of the
same thing. React Native has no browser for a Bonjour service and Expo does not
ship one.

Three things about it are worth knowing before changing it.

**Browsing finds a name, not an address.** A result's endpoint is
`.service(name:type:domain:)` and there is nothing dialable in it. The
supported way to get a host and a port is to open an `NWConnection` to the
service and read `currentPath.remoteEndpoint` once it is ready, which is what
the module does — and it cancels the connection the same instant, so the server
sees a TCP connect that closes immediately on the port it already serves HTTP
from.

**IPv4 only, deliberately.** A resolved endpoint can come back as a link-local
IPv6 address carrying a zone, `fe80::…%en0`, which is not something that
survives being put in a URL and handed to `fetch`. The protocol stack is forced
to v4, so an IPv6-only server is not found. Everything Gryt runs on a LAN today
has a v4 address.

**`NSBonjourServices` has to list the type.** iOS 14 and later refuse to browse
a service that is not declared in the plist, and the refusal is silent — the
browser starts, goes to `.ready`, and simply never reports anything. It is in
`app.json` next to `NSLocalNetworkUsageDescription`, which is the other half:
the first browse is what triggers the local-network permission prompt.

A refused permission does not fail. The browser sits in `.waiting` forever,
which is why the state is an event and why the join sheet has a "Gryt cannot
see your network" row that opens Settings. There is no way to ask a second
time.

Where it shows up is the join sheet, under "On your network", and the
switcher's Discovery row, which counts what has been found. Tapping a row fills
the address field rather than joining — mDNS knows a name and a port and
nothing about who may join, so the `/info` lookup and the card still happen the
way they do for an address somebody typed.

Android has no equivalent yet. The JS side reports `available: false` there and
both places render nothing rather than an empty section.

### Everything drawable comes from `@gryt/ui-native`

The app was importing `useTheme` and almost nothing else, and hand-rolling the
rest out of `Pressable`, `Text` and `View` against the tokens. That works and it
drifts: the join sheet had its own pill chips, its own error box and its own
primary button, all slightly different from the library's, and search drew
people as letter tiles while every other surface drew the generated face.

So the rule is: if `@gryt/ui-native` exports it, use it. `Spinner` over
`ActivityIndicator`, `Chip` over a bordered pill, `Alert` over a red box —
which also gets the assertive live region an icon never gave — `Surface` over
`borderWidth: 1` and a background colour, `Divider` over a one-pixel `View`,
`Button` over a painted `Pressable`.

Two things stay hand-rolled and should:

- **Rows.** There is no list-row component, and the four surfaces that need one
  want different things from it. Worth adding to the library at some point;
  it is not there today.
- **`PersonAvatar`.** The library's `Avatar` takes a URI, and a generated face
  is SVG markup that React Native's `Image` cannot decode. `AvatarFace` uses
  `react-native-svg` instead. The **disc** form of it — the raw drawing is a
  head-shaped silhouette with ragged edges — is used wherever there is no
  container to be round for it, which is `PersonAvatar`'s `variant="bare"` and
  the voice tile; framed, the container is the circle and the bare face floats
  inside it. A server is `ServerIcon`, a rounded square, and that difference is
  load-bearing: a circle is a person here.

### Settings save themselves

**There is no Save button anywhere, and adding one is the thing not to do.** A
setting commits when its field loses focus — the return key, a tap elsewhere, a
sheet being dismissed, the back button, which dismisses the keyboard before it
navigates for exactly this reason.

A button whose only job is to confirm what the field already says is a step to
forget, and forgetting it is a setting that silently did not take. It is also
old: nothing else on a phone works that way.

Two things that look like exceptions and are not:

- **Saving on every keystroke** is a different thing and mostly wrong. A
  half-typed hostname is not a setting. Focus loss is the moment somebody has
  finished with a field, which is why it is the trigger rather than the text
  changing.
- **A confirmation is not a Save button.** The auth server screen still asks
  before it signs you out, because the session is the expensive part and not the
  setting. Ask about the consequence, never about the write.

Where a value is only valid alongside another — the auth server and its identity
service — nothing is written until both agree, and the screen says which half is
missing rather than storing a state that fails later.

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

**A route that is not a tab is not the first tab.** `tabIndexOf` answers `null`
for `/dev`, `/identity` and `/preferences`, which are pushed on the root stack
and whose segments contain none of the three tab keys. It used to fall through
to `0`, so pushing any of them slid the pager to the server tab underneath —
and the bar's capsule with it. Only `/dev` showed it, because it is the one
presented as a modal and the reset happened behind a visible background; the
other two cover the screen while they do it. `useTabIndex` holds the last real
tab. GRYT-491.

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

### Preferences holds no preferences yet

`app/preferences.tsx` is the build number and two links. Every obvious
candidate for it turned out to be something else on inspection, and the list is
worth having before somebody adds one.

Output volume, the noise gate and automatic gain all need an audio graph. There
is no `AudioContext` here, so `voiceConfigFrom` fills each of them in as a
constant and says so field by field, and the engine's own README spells out
which can ever work on native and which cannot. A slider that moves a number
nothing reads is worse than no slider.

Notifications need push registration, which exists neither in this app nor on
the server.

Mute and deafen looked like the two easy ones — "join muted" and "join
deafened". They are not preferences. They are things you do during a call and
stop doing when it ends, so **hanging up clears both** and every call starts
with them off; `ShellContext`'s `setVoiceChannel` is where that happens.
Switching from one channel to another keeps them, because that is one
continuous piece of being in a call. A setting for it would make the ordinary
case the one you have to remember to undo.

Deafen itself did nothing at all on a phone until GRYT-486 — it was only ever
applied through the same missing audio graph — which is worth knowing before
trusting the button in an older build.

So the rule for adding to this screen is the rule the control row already
follows: check the engine actually reads it before drawing a control for it.

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
