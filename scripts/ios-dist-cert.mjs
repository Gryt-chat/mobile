#!/usr/bin/env node
/**
 * Make the distribution certificate CI signs with, and the .p12 that carries it. Run it
 * when `Release iOS` fails at export with `No signing certificate "iOS Distribution"
 * found` — they last a year. **The certificate it makes is not the one a laptop uses**:
 * Gryt's usual one is cloud-managed, which needs an Admin-role key.
 */

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { api } from "./asc.mjs";

const OUT = join(homedir(), ".gryt");

const openssl = (args, opts = {}) => execFileSync("openssl", args, { encoding: "utf8", ...opts });

async function list() {
  const { data } = await api("/v1/certificates?limit=200");
  for (const c of data) {
    const a = c.attributes;
    console.log(
      `${a.certificateType.padEnd(28)} ${String(a.displayName).padEnd(28)} ` +
        `expires ${a.expirationDate?.slice(0, 10)}  id=${c.id}`,
    );
  }
  // The cloud-managed distribution certificate is absent from this list by design.
  // Apple does not expose it here, which is a confusing way to learn it exists.
  console.log(`\n${data.length} certificates. A cloud-managed one would not appear.`);
}

async function create() {
  const work = mkdtempSync(join(tmpdir(), "gryt-cert-"));
  try {
    const keyFile = join(work, "dist.key");
    const csrFile = join(work, "dist.csr");
    // RSA 2048. Apple refuses anything else for a signing certificate.
    openssl([
      "req", "-new", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyFile, "-out", csrFile,
      "-subj", "/CN=Gryt CI Distribution/O=SVEKT GULLSERG - HANSEN/C=US",
    ], { stdio: ["ignore", "pipe", "ignore"] });

    console.log("==> asking App Store Connect to sign the request");
    const { data } = await api("/v1/certificates", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "certificates",
          attributes: { certificateType: "DISTRIBUTION", csrContent: readFileSync(csrFile, "utf8") },
        },
      }),
    });

    const pem =
      "-----BEGIN CERTIFICATE-----\n" +
      data.attributes.certificateContent.replace(/(.{64})/g, "$1\n").replace(/\n$/, "") +
      "\n-----END CERTIFICATE-----\n";
    const cerFile = join(work, "dist.pem");
    writeFileSync(cerFile, pem);

    // Asserted rather than assumed: a certificate that does not match the key builds a
    // .p12 that imports and then signs nothing, twenty minutes into a release.
    const ofCert = openssl(["x509", "-in", cerFile, "-noout", "-pubkey"]);
    const ofKey = openssl(["pkey", "-in", keyFile, "-pubout"]);
    if (ofCert.trim() !== ofKey.trim()) throw new Error("Apple returned a certificate for a different key.");

    const password = randomBytes(24).toString("base64url");
    const passFile = join(work, "pass");
    writeFileSync(passFile, password);
    const p12File = join(work, "dist.p12");

    // SHA1 and 3DES rather than OpenSSL 3's AES default. `security import` rejects the
    // modern MAC with "MAC verification failed", which reads as a wrong password.
    openssl([
      "pkcs12", "-export",
      "-inkey", keyFile, "-in", cerFile,
      "-name", "Apple Distribution: SVEKT GULLSERG - HANSEN (8883W2XTQ8)",
      "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1",
      "-passout", `file:${passFile}`, "-out", p12File,
    ]);

    mkdirSync(OUT, { recursive: true });
    chmodSync(OUT, 0o700);
    const outP12 = join(OUT, "gryt-ios-distribution.p12");
    const outPass = join(OUT, "gryt-ios-distribution.pass");
    writeFileSync(outP12, readFileSync(p12File));
    writeFileSync(outPass, password);
    chmodSync(outP12, 0o600);
    chmodSync(outPass, 0o600);

    console.log(`\nCertificate ${data.id}, expires ${data.attributes.expirationDate?.slice(0, 10)}`);
    console.log(`  ${outP12}`);
    console.log(`  ${outPass}`);
    console.log(`
Put it where CI can reach it:

  base64 -i ${outP12} | gh secret set GRYT_IOS_DIST_CERT_P12 --repo Gryt-chat/mobile
  gh secret set GRYT_IOS_DIST_CERT_PASSWORD --repo Gryt-chat/mobile < ${outPass}

Then run Release iOS. If you replaced an expired certificate, revoke the old one
once a release has gone out with this one:

  node scripts/ios-dist-cert.mjs --list
  node scripts/ios-dist-cert.mjs --revoke <id>
`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function revoke(id) {
  await api(`/v1/certificates/${id}`, { method: "DELETE" });
  console.log(`Revoked ${id}. Builds already on TestFlight are unaffected; they were signed while it was valid.`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "--list") await list();
  else if (cmd === "--revoke") {
    if (!arg) throw new Error("--revoke needs a certificate id; --list shows them");
    await revoke(arg);
  } else await create();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
