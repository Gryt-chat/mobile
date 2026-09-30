// Lets the app reach servers over plain http:// and ws://, as the desktop app can.
// Android blocks them in release builds unless the manifest says otherwise.
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidPlainServers(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });
};
