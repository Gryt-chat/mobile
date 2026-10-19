// Lets the app reach servers over plain http:// and ws://, as the desktop app can.
// Android blocks them in release builds unless the manifest says otherwise.
import { type ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";

const withAndroidPlainServers: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });

export default withAndroidPlainServers;
