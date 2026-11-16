import { p256 } from "@noble/curves/nist.js";
import { describe, expect, it, vi } from "vitest";

import { base64Url, utf8 } from "../identity/encoding";
import { checkApproveTicket } from "./approveTicket";

vi.mock("./config", () => ({ accountConfig: () => ({ identityUrl: "https://id.example" }) }));

function keyPair() {
  const secret = p256.utils.randomSecretKey();
  const point = p256.getPublicKey(secret, false);
  return { secret, jwk: { kty: "EC" as const, crv: "P-256" as const, x: base64Url(point.slice(1, 33)), y: base64Url(point.slice(33)), kid: "ca-1" } };
}

const ca = keyPair();
const keys = async () => [ca.jwk];
const now = 1_800_000_000_000;
let n = 0;

function ticket(claims: Record<string, string | number> = {}, header: Record<string, string> = {}, secret = ca.secret) {
  const h = base64Url(utf8(JSON.stringify({ alg: "ES256", typ: "gryt-approve+jwt", kid: "ca-1", ...header })));
  const p = base64Url(utf8(JSON.stringify({ purpose: "approve-ask", sub: "me", exp: now / 1000 + 600, jti: `t-${n++}`, deviceType: "Windows PC", ...claims })));
  return `${h}.${p}.${base64Url(p256.sign(utf8(`${h}.${p}`), secret, { prehash: true }))}`;
}

describe("checkApproveTicket", () => {
  it("shows a prompt only for a real, fresh, unseen ticket for this account, at most three an hour", async () => {
    const good = ticket();
    expect(await checkApproveTicket(good, "me", now, keys)).toEqual({ deviceType: "Windows PC" });
    expect(await checkApproveTicket(good, "me", now, keys)).toBeNull();
    expect(await checkApproveTicket(ticket({ sub: "someone" }), "me", now, keys)).toBeNull();
    expect(await checkApproveTicket(ticket({ exp: now / 1000 - 1 }), "me", now, keys)).toBeNull();
    expect(await checkApproveTicket(ticket({}, { typ: "JWT" }), "me", now, keys)).toBeNull();
    expect(await checkApproveTicket(ticket({}, {}, keyPair().secret), "me", now, keys)).toBeNull();
    expect(await checkApproveTicket("a.b.c", "me", now, keys)).toBeNull();

    expect(await checkApproveTicket(ticket(), "me", now, keys)).not.toBeNull();
    expect(await checkApproveTicket(ticket(), "me", now, keys)).not.toBeNull();
    expect(await checkApproveTicket(ticket(), "me", now, keys)).toBeNull();
    expect(await checkApproveTicket(ticket({ exp: now / 1000 + 4200 }), "me", now + 60 * 60 * 1000, keys)).not.toBeNull();
  });
});
