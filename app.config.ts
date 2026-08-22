import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Everything in `app.json`, plus the one value that must not be in it.
 *
 * `X-Gryt-App-Key` is a shared secret shipped inside the binary. The service is
 * blunt that this is friction rather than authentication — anyone can pull it
 * out of an app bundle — and what it buys is that a scanner finding an open
 * POST endpoint cannot fill the table overnight.
 *
 * `app.json` is committed, and this repository is public. A key written there
 * is a key anybody can have by cloning, which is a great deal easier than
 * unpacking an IPA, and it would spend the only property the key has. So the
 * value comes from the environment at build time and the committed default
 * stays empty.
 *
 * Empty is a working state. The service accepts unkeyed submissions when it has
 * no keys configured, which is how it runs on a laptop, and the app leaves the
 * header off rather than sending an empty one. Against a deployment that does
 * have keys, an empty one is refused — which is the right way round: a build
 * that forgot the key should fail against production, not against a dev box.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const reports = (config.extra?.reports ?? {}) as Record<string, unknown>;

  return {
    ...config,
    name: config.name ?? "Gryt",
    slug: config.slug ?? "gryt-mobile",
    extra: {
      ...config.extra,
      reports: {
        ...reports,
        // REPORTS_APP_KEY in the build environment. On EAS that is a secret;
        // locally it is however you like, and leaving it unset is fine.
        appKey: process.env.REPORTS_APP_KEY ?? reports.appKey ?? "",
      },
    },
  };
};
