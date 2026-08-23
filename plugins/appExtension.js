/* Adding an iOS app extension target from a config plugin.
 *
 * Gryt has two of these now — the ReplayKit broadcast extension from GRYT-557
 * and the share extension from GRYT-574 — and they need exactly the same forty
 * lines of Xcode project surgery: a group, a target, a sources phase, the build
 * settings, the entitlements, and a guard against adding it all twice. Only the
 * Info.plist differs, because that is where an extension says what kind of
 * extension it is.
 *
 * So the surgery is here and the two plugins bring their own plist.
 *
 * It has to be a config plugin at all because this project is Expo prebuild:
 * `ios/` is generated and gitignored, and a hand-made target in Xcode survives
 * exactly one `expo prebuild`.
 */
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const plist = require("@expo/plist").default;
const fs = require("fs");
const path = require("path");

/**
 * Copy the Swift in, and write the plist and entitlements beside it.
 *
 * Generated rather than checked in so the group id, the bundle id and the
 * version numbers have exactly one source — read off the Expo config the app
 * target is already built from, which is the only way the two stay in step. An
 * extension whose `CFBundleShortVersionString` disagrees with the app's is
 * rejected at upload, and that is a slow way to find out.
 */
function withExtensionFiles(config, { plugin, target, sourceDir, sources, group, infoPlist }) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const source = path.join(mod.modRequest.projectRoot, "targets", sourceDir);
      const destination = path.join(mod.modRequest.platformProjectRoot, target);
      fs.mkdirSync(destination, { recursive: true });

      for (const file of sources) {
        const from = path.join(source, file);
        if (!fs.existsSync(from)) {
          throw new Error(
            `${plugin}: ${file} is missing from targets/${sourceDir}. ` +
              "The extension cannot be built without it, and one that silently " +
              "compiles to nothing is worse than a failed build.",
          );
        }
        fs.copyFileSync(from, path.join(destination, file));
      }

      fs.writeFileSync(
        path.join(destination, `${target}-Info.plist`),
        plist.build({
          CFBundleName: "$(PRODUCT_NAME)",
          CFBundleDisplayName: "Gryt",
          CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
          CFBundleExecutable: "$(EXECUTABLE_NAME)",
          CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
          CFBundleShortVersionString: config.version ?? "1.0.0",
          CFBundleVersion: config.ios?.buildNumber ?? "1",
          /* Both extensions find the shared container this way, so it is here
           * rather than in either caller's plist. The key is the WebRTC
           * library's name because that is what first needed a group; the
           * container is the app's. */
          RTCAppGroupIdentifier: group,
          ...infoPlist,
        }),
      );

      fs.writeFileSync(
        path.join(destination, `${target}.entitlements`),
        plist.build({ "com.apple.security.application-groups": [group] }),
      );

      return mod;
    },
  ]);
}

/** Add the target to the Xcode project, since nobody is opening Xcode to do it. */
function withExtensionTarget(config, { target, bundleSuffix, sources, deploymentTarget }) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;

    /* Prebuild is not always from scratch — `expo prebuild` without `--clean`
     * keeps the existing project, and adding the target twice produces a second
     * copy of every file reference and a build that fails on duplicate symbols.
     * Checked against a project this plugin had already run on. */
    if (project.pbxTargetByName(target)) return mod;

    const bundleId = `${config.ios.bundleIdentifier}.${bundleSuffix}`;

    const group = project.addPbxGroup(
      [...sources, `${target}-Info.plist`, `${target}.entitlements`],
      target,
      target,
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

    const added = project.addTarget(target, "app_extension", target, bundleId);
    /* `addPbxGroup` already made the build files, so these resolve to the same
     * references rather than a second set. */
    project.addBuildPhase(sources, "PBXSourcesBuildPhase", "Sources", added.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", added.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;
      if (entry.buildSettings.PRODUCT_NAME !== `"${target}"`) continue;

      Object.assign(entry.buildSettings, {
        CODE_SIGN_ENTITLEMENTS: `"${target}/${target}.entitlements"`,
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

/**
 * Both halves, in the order they have to run.
 *
 * The files first: the Xcode mod adds references to paths, and a reference to a
 * file that is not there yet builds a project Xcode opens with red names in it.
 * Expo runs `dangerous` before the rest of the iOS mods, which is what makes
 * that ordering hold rather than a matter of luck — but the two are applied in
 * this order anyway so the intent is on the page.
 */
function withAppExtension(config, options) {
  config = withExtensionFiles(config, options);
  config = withExtensionTarget(config, options);
  return config;
}

module.exports = { withAppExtension };
