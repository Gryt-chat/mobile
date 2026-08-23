/* Put Gryt in the iOS share sheet.
 *
 * Android needed four lines of manifest — see `withShareTarget.js`. iOS needs a
 * whole second process: a Share Extension, with its own bundle id, its own
 * signing, and no access to the app's socket, keypair or server list. It runs
 * inside the *sending* app.
 *
 * What it can do is write into the App Group container both processes see.
 * `targets/share/ShareViewController.swift` copies the shared items there and
 * opens Gryt; `modules/share-intent`'s iOS side reads them. That reading half
 * shipped with the Android work in GRYT-571 and has had nothing to read until
 * now.
 *
 * The App Group itself is registered by `withScreenShare.js`, which needed one
 * first for ReplayKit. There is one container and both extensions use it, which
 * is why the key naming it — `RTCAppGroupIdentifier` — has a WebRTC name on a
 * plist that has nothing to do with WebRTC.
 *
 * The Xcode surgery is in `appExtension.js`, shared with that plugin.
 */
const { withAppExtension } = require("./appExtension");

/** The name of the extension target, its folder, and its product. */
const TARGET = "GrytShare";

const SOURCES = ["ShareViewController.swift"];

/**
 * What Gryt offers to accept, and how many of each.
 *
 * `NSExtensionActivationRule` is how an extension says what it is for. Getting
 * it wrong in the generous direction — the `TRUEPREDICATE` that every tutorial
 * uses — puts Gryt in the sheet for things it cannot send, and being offered as
 * a destination that then refuses is worse than not being offered.
 *
 * The counts match the composer's `MAX_ATTACHMENTS`. Above them the extension
 * does not appear at all, which is a clearer answer than appearing and then
 * dropping the rest.
 *
 * A web page counts as a URL, which is why the URL rule is here even though
 * links arrive as text on the other side.
 *
 * `NSExtensionActivationSupportsWebPageWithMaxCount` is deliberately *not*
 * here. It is meant to be paired with an `NSExtensionJavaScriptPreprocessingFile`
 * that runs in the page and hands back what it found; without one the rule adds
 * nothing Safari does not already give through `SupportsWebURL`, and it changes
 * what arrives in the item provider. Sharing a page from Safari activates on
 * the URL rule.
 */
const ACTIVATION = {
  NSExtensionActivationSupportsImageWithMaxCount: 4,
  NSExtensionActivationSupportsMovieWithMaxCount: 4,
  NSExtensionActivationSupportsFileWithMaxCount: 4,
  NSExtensionActivationSupportsText: true,
  NSExtensionActivationSupportsWebURLWithMaxCount: 1,
};

module.exports = function withShareExtension(config, props = {}) {
  return withAppExtension(config, {
    plugin: "withShareExtension",
    target: TARGET,
    sourceDir: "share",
    sources: SOURCES,
    bundleSuffix: "share",
    /* The same container `withScreenShare` registers, derived the same way so
     * the two cannot drift. Overriding one without the other would give Gryt
     * two containers and a share the app never finds. */
    group: props.appGroup || `group.${config.ios?.bundleIdentifier ?? "chat.gryt.mobile"}`,
    deploymentTarget: props.deploymentTarget || "15.1",
    infoPlist: {
      NSExtension: {
        NSExtensionPointIdentifier: "com.apple.share-services",
        /* A principal class rather than a storyboard. There is no interface to
         * build — the controller takes what was shared and leaves. */
        NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).ShareViewController",
        NSExtensionAttributes: { NSExtensionActivationRule: ACTIVATION },
      },
    },
  });
};
