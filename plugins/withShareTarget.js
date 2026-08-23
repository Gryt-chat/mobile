/* Put Gryt in the Android share sheet.
 *
 * An app appears there because its launcher activity declares an intent filter
 * for `ACTION_SEND`. There is no API for it and no runtime registration — it is
 * a manifest fact, decided at install time, which is why this is a config
 * plugin and not a call somewhere in the app.
 *
 * iOS is not here. It needs a Share Extension, which is a whole second target
 * rather than four lines of manifest, and it lands separately — see GRYT-571.
 * `modules/share-intent` already has the iOS half of the reading side, so that
 * PR adds the extension and nothing else.
 *
 * **Two filters, because Android has two actions.** `ACTION_SEND` is one item,
 * `ACTION_SEND_MULTIPLE` is several, and an app that declares only the first is
 * silently absent from the sheet the moment somebody selects a second photo.
 * That is the kind of gap nobody reports as a bug — they just conclude Gryt
 * cannot do it.
 */
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * What Gryt will accept.
 *
 * A wildcard of star-slash-star is tempting and wrong: it puts Gryt in the
 * sheet for every file on the phone, including ones the upload route refuses,
 * and being offered as a destination that then says no is worse than not being
 * offered. These are the types the composer can already send.
 */
const TYPES = ["text/plain", "image/*", "video/*", "audio/*", "application/pdf"];

/* A multi-select of text is not a thing anybody does, so the multiple filter
 * covers files only. */
const MULTIPLE_TYPES = TYPES.filter((type) => type !== "text/plain");

function filterFor(action, types) {
  return {
    action: [{ $: { "android:name": `android.intent.action.${action}` } }],
    category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
    data: types.map((type) => ({ $: { "android:mimeType": type } })),
  };
}

/** Whether this filter is already there, so a re-run does not add a second. */
function declares(filters, action) {
  return filters.some((filter) =>
    (filter.action ?? []).some(
      (entry) => entry.$?.["android:name"] === `android.intent.action.${action}`,
    ),
  );
}

module.exports = function withShareTarget(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const activity = (application.activity ?? []).find(
      (entry) => entry.$?.["android:name"] === ".MainActivity",
    );

    if (!activity) {
      throw new Error(
        "withShareTarget: MainActivity is not in the manifest. The Expo template " +
          "changed shape — fix the plugin rather than shipping an app that is " +
          "silently missing from the share sheet.",
      );
    }

    /**
     * `singleTask` is what makes a second share reach a running app.
     *
     * Without it Android starts another instance of the activity, so
     * `onNewIntent` never fires and `ShareIntentModule` never sees the share.
     * Expo's template sets it, so this is a check rather than a change — if it
     * ever stops being true, the symptom is a share that opens Gryt and then
     * does nothing at all, which is a long way from the cause.
     */
    const launchMode = activity.$?.["android:launchMode"];
    if (launchMode !== "singleTask") {
      throw new Error(
        `withShareTarget: MainActivity has launchMode "${launchMode}", not "singleTask". ` +
          "Sharing to an already-running Gryt would start a second copy and the " +
          "share would be dropped.",
      );
    }

    activity["intent-filter"] = activity["intent-filter"] ?? [];
    const filters = activity["intent-filter"];

    if (!declares(filters, "SEND")) filters.push(filterFor("SEND", TYPES));
    if (!declares(filters, "SEND_MULTIPLE")) {
      filters.push(filterFor("SEND_MULTIPLE", MULTIPLE_TYPES));
    }

    return mod;
  });
};
