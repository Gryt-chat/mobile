// Push a built AAB to a Play track.
//
// The other half of `playstore.sh`, which builds and signs a 97 MB bundle and
// then stops. Every release until now has been a drag into Play Console, and
// the bundle is too large to move through anything but the browser it is being
// dropped into — so the person at that machine had to be the one to do it.
//
// Four calls, which is the whole of the Play Developer API v3 for this:
//
//   POST   /edits                     open an edit
//   POST   /edits/{id}/bundles        upload the aab
//   PUT    /edits/{id}/tracks/{track} put that versionCode on the track
//   POST   /edits/{id}:commit         make it real
//
// An edit is a transaction. Nothing is visible until the commit, and an edit
// left open expires on its own — but a stale one still shows in the Console as
// unfinished work, so this deletes its own on any failure.
//
// **No dependency, on purpose.** `googleapis` is the obvious client and this is
// a React Native app's package.json, which `expo-doctor` reads and which people
// install to run the app. A service account key is an RSA key and a JWT is a
// signed string, both of which `node:crypto` already does, so the cost of
// avoiding that is about thirty lines.
import { createSign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

const PACKAGE_NAME = "chat.gryt.mobile";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/**
 * Which track, and where the bundle is.
 *
 * `internal` by default and not overridable to `production` by accident: the
 * argument is checked against a list, because a typo that reached `production`
 * would be a public release rather than an error.
 */
const TRACKS = ["internal", "alpha", "beta"];

function usage(message) {
  if (message) console.error(`playstore-upload: ${message}\n`);
  console.error(`Usage: yarn playstore:upload <path-to.aab> [--track internal]

  GRYT_PLAY_SERVICE_ACCOUNT  path to the service account JSON key

Tracks: ${TRACKS.join(", ")}. Production is deliberately not one of them.`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

const aabPath = args.find((a) => !a.startsWith("--"));
if (!aabPath) usage("no bundle given");

const trackFlag = args.indexOf("--track");
const track = trackFlag === -1 ? "internal" : args[trackFlag + 1];
if (!TRACKS.includes(track)) usage(`unknown track ${JSON.stringify(track)}`);

const keyPath = process.env.GRYT_PLAY_SERVICE_ACCOUNT;
if (!keyPath) usage("GRYT_PLAY_SERVICE_ACCOUNT is not set");

/**
 * A service account key, exchanged for an access token.
 *
 * Google's own flow: sign a claim set with the key's private half, hand the
 * signature to the token endpoint, get an hour's access token back. There is no
 * refresh token and none is wanted — this process lives for one upload.
 */
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    /* An hour is the maximum Google accepts. The upload is the slow part and a
     * 97 MB transfer on a bad connection is not five minutes. */
    exp: now + 3600,
  };

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key.private_key)
    .toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* Worth naming, because the two likely causes read the same from here and
     * have different fixes. `invalid_grant` with a valid key is usually the
     * clock; `access_denied` is the service account not being invited to the
     * Play account yet, which can take hours to propagate after it is. */
    throw new Error(
      `token exchange failed (${res.status}): ${body.error ?? ""} ${body.error_description ?? ""}`.trim(),
    );
  }
  return body.access_token;
}

/** Every call but the upload: JSON in, JSON out, and a readable error. */
async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).error?.message ?? text;
    } catch {
      /* Play returns HTML for some auth failures. Print what came back. */
    }
    throw new Error(`${method} ${path} failed (${res.status}): ${detail}`);
  }
  return text ? JSON.parse(text) : {};
}

const key = JSON.parse(await readFile(keyPath, "utf8"));
if (!key.client_email || !key.private_key) {
  throw new Error(
    `${keyPath} is not a service account key — it has no client_email and private_key. ` +
      "An OAuth client secret looks similar and is not this.",
  );
}

const bundle = await readFile(aabPath);
const { size } = await stat(aabPath);
console.log(`==> ${basename(aabPath)}, ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`    as ${key.client_email}`);

const token = await accessToken(key);

const edit = await api(token, "POST", `/applications/${PACKAGE_NAME}/edits`);
console.log(`==> edit ${edit.id}`);

try {
  /* The upload is the one call that is not JSON, and it is on a different path
   * prefix — `/upload/...` rather than `/...`. Posting the bundle to the
   * ordinary endpoint returns a 400 that does not say so.
   *
   * `uploadType=media` is the simple one-shot form: the whole file as the body,
   * no session, no ranges. Google recommends the resumable form for large
   * uploads and a bundle is 97 MB, which is close enough to the simple form's
   * ceiling to be worth knowing about — if this starts failing on the transfer
   * rather than on the response, that is the thing to change, and it is a
   * different endpoint rather than a flag.
   *
   * The file is read into memory rather than streamed for the same reason there
   * is no dependency: a streamed body needs `duplex: "half"` and the failure
   * mode when it is missing is opaque. 97 MB is not a problem on a machine that
   * just ran Gradle. */
  console.log("==> uploading");
  const res = await fetch(
    `${UPLOAD}/applications/${PACKAGE_NAME}/edits/${edit.id}/bundles?uploadType=media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
      },
      body: bundle,
    },
  );

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).error?.message ?? text;
    } catch {
      /* As above. */
    }
    throw new Error(`upload failed (${res.status}): ${detail}`);
  }

  const uploaded = JSON.parse(text);
  console.log(`    versionCode ${uploaded.versionCode}`);

  /**
   * What app.json says, checked against what Play took.
   *
   * These can disagree, and it is the kind of disagreement that is invisible
   * until somebody wonders why a fix is not in the build: `yarn bump:build`
   * moves app.json, and a bundle built before that still carries the old
   * number. Play does not mind. The person expecting the new one does.
   */
  const config = JSON.parse(await readFile(new URL("../app.json", import.meta.url), "utf8"));
  const expected = config.expo.android.versionCode;
  if (uploaded.versionCode !== expected) {
    throw new Error(
      `this bundle is versionCode ${uploaded.versionCode} and app.json says ${expected}. ` +
        "Either it was built before the last bump:build, or the bump has not been committed.",
    );
  }

  /* `completed` rather than `draft`. An internal-testing release is available
   * to its testers within minutes and needs no review, so a draft here is a
   * release nobody can install and nobody is told about. */
  await api(token, "PUT", `/applications/${PACKAGE_NAME}/edits/${edit.id}/tracks/${track}`, {
    track,
    releases: [{ versionCodes: [String(uploaded.versionCode)], status: "completed" }],
  });
  console.log(`==> track ${track}`);

  await api(token, "POST", `/applications/${PACKAGE_NAME}/edits/${edit.id}:commit`);
  console.log(`==> committed

versionCode ${uploaded.versionCode} of ${config.expo.version} is on ${track}.

Then bump, or the next upload is refused:
  yarn bump:build`);
} catch (error) {
  /* Delete rather than leave it. An abandoned edit expires on its own, but
   * until it does the Console shows unfinished changes, and the next person to
   * open the listing has to work out whether they are someone's work in
   * progress. Best effort: if this fails too, the original error is the one
   * worth reporting. */
  await api(token, "DELETE", `/applications/${PACKAGE_NAME}/edits/${edit.id}`).catch(() => {});
  throw error;
}
