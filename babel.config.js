/* Reanimated 4 runs animations as worklets on the UI thread, and worklets only
 * exist because this plugin rewrites the functions marked for them. Without it
 * every `useAnimatedStyle` silently falls back to the JS thread — which is the
 * exact failure this project is trying to avoid, and it does not error, it just
 * drops frames under load.
 *
 * It has to stay last in the plugin list. That is the plugin's own requirement.
 */
module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"]
  };
};
