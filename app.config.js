// google-services.json comes from the Firebase console. Android pushes need it, and
// without it the build still works with pushes off (GRYT-1656).
const { existsSync } = require("node:fs");
const { join } = require("node:path");

module.exports = ({ config }) =>
  existsSync(join(__dirname, "google-services.json"))
    ? { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } }
    : config;
