/* The Notification Service Extension that shows a push's sealed preview (GRYT-1688): who wrote,
   where, and the first line. It reads the keys the app leaves in the shared group. */
const { withAppExtension } = require("./appExtension");

module.exports = function withNotificationExtension(config, props = {}) {
  return withAppExtension(config, {
    plugin: "withNotificationExtension",
    target: "GrytNotify",
    sourceDir: "notify",
    sources: ["NotificationService.swift"],
    bundleSuffix: "notify",
    // The same container the app and the other extensions use, derived the same way.
    group: props.appGroup || `group.${config.ios?.bundleIdentifier ?? "chat.gryt.app"}`,
    deploymentTarget: props.deploymentTarget || "15.1",
    infoPlist: {
      NSExtension: {
        NSExtensionPointIdentifier: "com.apple.usernotifications.service",
        NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).NotificationService",
      },
    },
  });
};
