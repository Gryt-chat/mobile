/* Everything native that sharing a phone screen needs, on both platforms.
 *
 * The two platforms disagree about what a screen share *is*, and the plugin is
 * mostly that disagreement written down.
 *
 * **iOS** will not let an app read the screen. Only ReplayKit can, and ReplayKit
 * runs a *separate process* — a Broadcast Upload Extension, with its own bundle
 * id, its own signing, and a 50 MB memory ceiling the system enforces by killing
 * it. The frames have to get from that process back into ours, and the road they
 * take is an App Group: a shared container both processes can see, with a unix
 * socket in it. `react-native-webrtc` implements the app end of that socket and
 * ships **no** extension end, so `targets/broadcast/` is ours and this plugin is
 * what compiles it.
 *
 * **Android** has `MediaProjection`, which is in-process and needs no extension
 * at all — `react-native-webrtc` even ships the foreground service and its
 * manifest entry. What it does not ship is the permissions the *app* has to
 * declare to be allowed to start that service, and on Android 14 a missing
 * `FOREGROUND_SERVICE_MEDIA_PROJECTION` is not a warning, it is a
 * `SecurityException` the moment sharing starts.
 *
 * It is one plugin rather than two because it is one feature, and because the
 * App Group it sets up is about to be load-bearing for more than this — sharing
 * *into* Gryt from other apps needs the same container.
 *
 * The Xcode surgery that adds the extension target is in `appExtension.js`,
 * shared with the share extension — both need the same group, target, sources
 * phase and build settings, and differ only in their Info.plist.
 */
const { AndroidConfig, withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const { withAppExtension } = require("./appExtension");

/** The name of the extension target, its folder, and its product. */
const TARGET = "GrytBroadcast";

/* Swift, in dependency order for no reason other than reading order — Xcode
 * compiles a target's sources as a set. */
const SOURCES = ["SocketConnection.swift", "SampleUploader.swift", "SampleHandler.swift"];

/**
 * The one string both processes have to agree on.
 *
 * Defaults to `group.<bundle id>`, which is the convention and keeps it derived
 * rather than typed twice. It still has to exist in the Apple developer account
 * before a build will sign — an App Group is a registered identifier, not just a
 * string in a plist.
 */
function groupFor(config, props) {
  return props.appGroup || `group.${config.ios?.bundleIdentifier ?? "chat.gryt.mobile"}`;
}

/* ------------------------------------------------------------------ iOS */

/** The app's own entitlement, so it can open the shared container. */
function withAppGroupEntitlement(config, group) {
  return withEntitlementsPlist(config, (mod) => {
    const key = "com.apple.security.application-groups";
    const groups = new Set(mod.modResults[key] ?? []);
    groups.add(group);
    mod.modResults[key] = [...groups];
    return mod;
  });
}

/**
 * Where `react-native-webrtc` looks for the group.
 *
 * `ScreenCaptureController.m` reads `RTCAppGroupIdentifier` out of the app's
 * Info.plist and builds the socket path from it. Miss this key and
 * `getDisplayMedia()` resolves, the picker appears, the broadcast starts — and
 * no frame ever arrives, with nothing logged anywhere to say why.
 */
function withRTCAppGroup(config, group) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.RTCAppGroupIdentifier = group;
    return mod;
  });
}

/* -------------------------------------------------------------- Android */

/**
 * The permissions the app has to declare for `MediaProjection`.
 *
 * `react-native-webrtc` ships `MediaProjectionService` and declares it with
 * `foregroundServiceType="mediaProjection"`, which is the library's half. The
 * app's half is being allowed to start it: on Android 14 the typed permission
 * became mandatory and its absence is a `SecurityException` thrown as sharing
 * begins, not a warning at install.
 *
 * `POST_NOTIFICATIONS` is for the notification that service is required to
 * show. Denied, the share still runs and the notification does not appear —
 * which is worth knowing, because a screen being recorded with no visible sign
 * of it is the exact thing that notification exists to prevent.
 */
function withAndroidScreenCapture(config) {
  return AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    "android.permission.POST_NOTIFICATIONS",
  ]);
}

/* ------------------------------------------------------------------ all */

module.exports = function withScreenShare(config, props = {}) {
  const group = groupFor(config, props);
  const deploymentTarget = props.deploymentTarget || "15.1";

  config = withAppGroupEntitlement(config, group);
  config = withRTCAppGroup(config, group);
  config = withAppExtension(config, {
    plugin: "withScreenShare",
    target: TARGET,
    sourceDir: "broadcast",
    sources: SOURCES,
    bundleSuffix: "broadcast",
    group,
    deploymentTarget,
    infoPlist: {
      NSExtension: {
        NSExtensionPointIdentifier: "com.apple.broadcast-services-upload",
        NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).SampleHandler",
        /* Without this the extension appears in the system-wide broadcast
         * picker as a way to record anything, rather than only where Gryt
         * offers it. */
        RPBroadcastProcessMode: "RPBroadcastProcessModeSampleBuffer",
      },
    },
  });
  config = withAndroidScreenCapture(config);
  return config;
};
