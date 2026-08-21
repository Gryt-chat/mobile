import { describe, expect, it } from "vitest";

import { base64Url, utf8 } from "../identity/encoding";
import { decodeToken, identityFrom } from "./claims";

/** A token shaped like the server's, signed with nothing — only the claims are read. */
function token(payload: Record<string, unknown>): string {
  return [
    base64Url(utf8(JSON.stringify({ alg: "HS256", typ: "JWT" }))),
    base64Url(utf8(JSON.stringify(payload))),
    "not-a-real-signature",
  ].join(".");
}

describe("decodeToken", () => {
  it("reads the claims the server puts in", () => {
    expect(
      decodeToken(token({ serverUserId: "u1", nickname: "Sivert", serverHost: "a:5002" })),
    ).toMatchObject({ serverUserId: "u1", nickname: "Sivert", serverHost: "a:5002" });
  });

  it("answers null rather than throwing on anything that is not a token", () => {
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("not-a-jwt")).toBeNull();
    expect(decodeToken("a.!!!.c")).toBeNull();
    expect(decodeToken("header.only")).toMatchObject({});
  });

  it("answers null for a payload that is not an object", () => {
    expect(decodeToken(["h", base64Url(utf8("42")), "s"].join("."))).toBeNull();
    expect(decodeToken(["h", base64Url(utf8("null")), "s"].join("."))).toBeNull();
  });
});

describe("identityFrom", () => {
  it("takes the sender id and the name", () => {
    expect(identityFrom(token({ serverUserId: "u1", nickname: "Sivert" }))).toEqual({
      serverUserId: "u1",
      nickname: "Sivert",
    });
  });

  /* Without a sender id there is nothing to draw an optimistic message with,
   * and guessing one would put it in a block of its own. */
  it("answers null when there is no sender id to use", () => {
    expect(identityFrom(token({ nickname: "Sivert" }))).toBeNull();
    expect(identityFrom(token({ serverUserId: "" }))).toBeNull();
    expect(identityFrom("rubbish")).toBeNull();
  });

  it("survives a token with no nickname", () => {
    expect(identityFrom(token({ serverUserId: "u1" }))).toEqual({
      serverUserId: "u1",
      nickname: "",
    });
  });
});
