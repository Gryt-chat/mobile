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
 * It has to be a config plugin rather than a checked-in `ios/` directory: this
 * project is Expo prebuild, the native folders are generated and gitignored, and
 * a hand-made Xcode target would survive exactly one `expo prebuild`.
 */
const {
  AndroidConfig,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const plist = require("@expo/plist").default;
const fs = require("fs");
const path = require("path");

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

/**
 * Copy the Swift in and generate the extension's plist and entitlements.
 *
 * Generated rather than checked in so the group id, the bundle id and the
 * version numbers have exactly one source — this file reads them off the Expo
 * config that the app target is already built from, which is the only way the
 * two stay in step. An extension whose `CFBundleShortVersionString` disagrees
 * with the app's is rejected at upload, and that is a slow way to find out.
 */
function withExtensionFiles(config, { group, version, build }) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const source = path.join(mod.modRequest.projectRoot, "targets", "broadcast");
      const destination = path.join(mod.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(destination, { recursive: true });

      for (const file of SOURCES) {
        const from = path.join(source, file);
        if (!fs.existsSync(from)) {
          throw new Error(
            `withScreenShare: ${file} is missing from targets/broadcast. ` +
              "The extension cannot be built without it, and a screen share " +
              "that silently compiles to nothing is worse than a failed build.",
          );
        }
        fs.copyFileSync(from, path.join(destination, file));
      }

      fs.writeFileSync(
        path.join(destination, `${TARGET}-Info.plist`),
        plist.build({
          CFBundleName: "$(PRODUCT_NAME)",
          CFBundleDisplayName: "Gryt",
          CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
          CFBundleExecutable: "$(EXECUTABLE_NAME)",
          CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
          CFBundleShortVersionString: version,
          CFBundleVersion: build,
          /* Read back by SampleHandler, so the extension does not have to
           * hardcode what the app already knows. */
          RTCAppGroupIdentifier: group,
          NSExtension: {
            NSExtensionPointIdentifier: "com.apple.broadcast-services-upload",
            NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).SampleHandler",
            /* Without this the extension appears in the system-wide broadcast
             * picker as a way to record anything, rather than only where Gryt
             * offers it. */
            RPBroadcastProcessMode: "RPBroadcastProcessModeSampleBuffer",
          },
        }),
      );

      fs.writeFileSync(
        path.join(destination, `${TARGET}.entitlements`),
        plist.build({ "com.apple.security.application-groups": [group] }),
      );

      return mod;
    },
  ]);
}

/** Add the target to the Xcode project, since nobody is opening Xcode to do it. */
function withExtensionTarget(config, { deploymentTarget }) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;

    /* Prebuild is not always from scratch — `expo prebuild` without `--clean`
     * keeps the existing project, and adding the target twice produces a second
     * copy of every file reference and a build that fails on duplicate symbols.
     * Checked against a project this plugin had already run on. */
    if (project.pbxTargetByName(TARGET)) return mod;

    const bundleId = `${config.ios.bundleIdentifier}.broadcast`;

    const group = project.addPbxGroup(
      [...SOURCES, `${TARGET}-Info.plist`, `${TARGET}.entitlements`],
      TARGET,
      TARGET,
    );

    /* Hang it off the project's root group — the one with neither a name nor a
     * path — so the files are visible in Xcode rather than only in the build. */
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      const entry = groups[key];
      if (typeof entry === "object" && entry.name === undefined && entry.path === undefined) {
        project.addToPbxGroup(group.uuid, key);
      }
    }

    const target = project.addTarget(TARGET, "app_extension", TARGET, bundleId);
    /* `addPbxGroup` already made the build files, so these resolve to the same
     * references rather than a second set. */
    project.addBuildPhase(SOURCES, "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;
      if (entry.buildSettings.PRODUCT_NAME !== `"${TARGET}"`) continue;

      Object.assign(entry.buildSettings, {
        CODE_SIGN_ENTITLEMENTS: `"${TARGET}/${TARGET}.entitlements"`,
        CODE_SIGN_STYLE: "Automatic",
        IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: '"1,2"',
        /* An extension is not installed on its own, and leaving this off makes
         * `xcodebuild install` try. */
        SKIP_INSTALL: "YES",
      });
    }

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
  config = withExtensionFiles(config, {
    group,
    version: config.version ?? "1.0.0",
    build: config.ios?.buildNumber ?? "1",
  });
  config = withExtensionTarget(config, { deploymentTarget });
  config = withAndroidScreenCapture(config);
  return config;
};
