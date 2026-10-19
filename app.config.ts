// google-services.json comes from the Firebase console. Android pushes need it, and
// without it the build still works with pushes off (GRYT-1656).
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): Partial<ExpoConfig> =>
  existsSync(join(__dirname, "google-services.json"))
    ? { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } }
    : config;
