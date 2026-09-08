// Push a built AAB to a Play track. Four calls: open an edit, upload the bundle, put
// it on the track, commit. An edit is a transaction, so this deletes its own on
// failure. **No dependency, on purpose** — `node:crypto` signs the JWT.
import { createSign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

const PACKAGE_NAME = "chat.gryt.mobile";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/**
 * Which track, and where the bundle is. `internal` by default and checked against a
 * list: a typo reaching `production` would be a public release rather than an error.
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
 * A service account key, exchanged for an access token. No refresh token and none
 * wanted — this process lives for one upload.
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

  const res = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  },
  "the token exchange",
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* Worth naming, because the two likely causes read the same: `invalid_grant` is
     * usually the clock, `access_denied` an uninvited service account. */
    throw new Error(
      `token exchange failed (${res.status}): ${body.error ?? ""} ${body.error_description ?? ""}`.trim(),
    );
  }
  return body.access_token;
}

/**
 * How many times to try a call Play answered badly, and how long to wait. Four
 * attempts over about fifteen seconds, so an outage still fails the job.
 */
const RETRY_BACKOFF_MS = [1000, 3000, 9000];

/**
 * Whether a response is worth asking again about. **429 and 5xx only** — retrying a
 * 4xx would bury the clock-skew 401 and the propagating-invitation 403.
 */
function worthRetrying(status) {
  return status === 429 || status >= 500;
}

/**
 * `fetch`, with the transient failures taken out. A network error is retried on the
 * same terms as a 5xx. The last attempt's response is returned however it went.
 */
async function fetchWithRetry(url, init, what) {
  let last;
  for (let attempt = 0; ; attempt++) {
    try {
      last = await fetch(url, init);
      if (!worthRetrying(last.status) || attempt >= RETRY_BACKOFF_MS.length) return last;
      console.log(
        `    ${what} answered ${last.status}; trying again in ${RETRY_BACKOFF_MS[attempt] / 1000}s`,
      );
    } catch (error) {
      if (attempt >= RETRY_BACKOFF_MS.length) throw error;
      console.log(
        `    ${what} did not answer (${error.message}); trying again in ${RETRY_BACKOFF_MS[attempt] / 1000}s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt]));
  }
}

/** Every call but the upload: JSON in, JSON out, and a readable error. */
async function api(token, method, path, body) {
  const res = await fetchWithRetry(
    `${API}${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    `${method} ${path}`,
  );

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
  /* The upload is the one call that is not JSON, and it is on the `/upload/...` prefix
   * — the ordinary endpoint returns a 400 that does not say so. `uploadType=media` is
   * the one-shot form, and 97 MB is close to its ceiling. */
  console.log("==> uploading");
  /* Retried on the same terms as the rest, and it is the expensive one to repeat —
     93 MB back up the wire, still cheaper than the Gradle run. */
  const res = await fetchWithRetry(
    `${UPLOAD}/applications/${PACKAGE_NAME}/edits/${edit.id}/bundles?uploadType=media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
      },
      body: bundle,
    },
    "the upload",
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
   * What app.json says, checked against what Play took. `yarn bump:build` moves
   * app.json, and a bundle built before that still carries the old number.
   */
  const config = JSON.parse(await readFile(new URL("../app.json", import.meta.url), "utf8"));
  const expected = config.expo.android.versionCode;
  if (uploaded.versionCode !== expected) {
    throw new Error(
      `this bundle is versionCode ${uploaded.versionCode} and app.json says ${expected}. ` +
        "Either it was built before the last bump:build, or the bump has not been committed.",
    );
  }

  /* `completed` rather than `draft`. An internal-testing release needs no review, so
     a draft is a release nobody can install and nobody is told about. */
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
  /* Delete rather than leave it: until an abandoned edit expires the Console shows
     unfinished changes. Best effort. */
  await api(token, "DELETE", `/applications/${PACKAGE_NAME}/edits/${edit.id}`).catch(() => {});
  throw error;
}
