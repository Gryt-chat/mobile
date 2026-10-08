// Hand a just-uploaded build to the public TestFlight group and send it to beta review.
// Run after `altool` and before the bump, so app.json still names the uploaded build.
import { readFile } from "node:fs/promises";

import { api } from "./asc.mjs";

const GROUP = "Public testers";
const POLL_MS = 30_000;
const GIVE_UP_MS = 45 * 60_000;
const DEFAULT_NOTES =
  "What's new is in the changelog at gryt.chat/changelog. Use Report a bug in the app when something breaks.";

const config = JSON.parse(await readFile(new URL("../app.json", import.meta.url), "utf8"));
const bundleId = config.expo.ios.bundleIdentifier;
const buildNumber = String(config.expo.ios.buildNumber);
const notes = process.env.GRYT_TESTFLIGHT_NOTES?.trim() || DEFAULT_NOTES;

const app = (await api(`/v1/apps?filter[bundleId]=${bundleId}&fields[apps]=bundleId`)).data.find(
  (a) => a.attributes.bundleId === bundleId,
);
if (!app) throw new Error(`No App Store Connect app for ${bundleId}`);

// Apple processes an upload before it can be tested, usually in five to twenty minutes.
async function processedBuild() {
  const started = Date.now();
  for (;;) {
    const builds = await api(
      `/v1/builds?filter[app]=${app.id}&filter[version]=${buildNumber}&fields[builds]=processingState,version`,
    );
    const build = builds.data[0];
    const state = build?.attributes.processingState ?? "NOT_YET_LISTED";
    if (state === "VALID") return build;
    if (state === "FAILED" || state === "INVALID") throw new Error(`Build ${buildNumber} is ${state}`);
    if (Date.now() - started > GIVE_UP_MS) throw new Error(`Build ${buildNumber} still ${state} after 45 minutes`);
    console.log(`    build ${buildNumber}: ${state}, checking again in 30s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const build = await processedBuild();
console.log(`==> build ${buildNumber} is processed`);

// One "what to test" per language the app's tester description has; Apple asks for the primary one.
const locales = (await api(`/v1/apps/${app.id}/betaAppLocalizations?fields[betaAppLocalizations]=locale`)).data.map(
  (l) => l.attributes.locale,
);
for (const locale of locales) {
  await api("/v1/betaBuildLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale, whatsNew: notes },
        relationships: { build: { data: { type: "builds", id: build.id } } },
      },
    }),
  }).catch((error) => console.log(`    what to test (${locale}) not set: ${error.message.split("\n")[0]}`));
}

const group = (await api(`/v1/apps/${app.id}/betaGroups?fields[betaGroups]=name&limit=50`)).data.find(
  (g) => g.attributes.name === GROUP,
);
if (!group) throw new Error(`No TestFlight group called "${GROUP}"`);
await api(`/v1/betaGroups/${group.id}/relationships/builds`, {
  method: "POST",
  body: JSON.stringify({ data: [{ type: "builds", id: build.id }] }),
});
console.log(`==> added to ${GROUP}`);

// Apple waves through most later builds of an approved version; a refusal here means one is already pending.
try {
  const submission = await api("/v1/betaAppReviewSubmissions", {
    method: "POST",
    body: JSON.stringify({
      data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } },
    }),
  });
  console.log(`==> beta review: ${submission.data.attributes.betaReviewState}`);
} catch (error) {
  console.log(`==> beta review not submitted: ${error.message.split("\n").slice(0, 2).join(" ")}`);
}
