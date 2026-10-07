import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignedRequest } from "./signed-request";

const make = (payload: object, secret: string) => {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
};

describe("parseSignedRequest", () => {
  it("accepts a correctly signed request", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "123" }, "s"), "s")?.user_id).toBe("123");
  });
  it("rejects a wrong secret, tampering and garbage", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "1" }, "s"), "other")).toBeNull();
    const ok = make({ algorithm: "HMAC-SHA256", user_id: "1" }, "s");
    expect(parseSignedRequest(ok.slice(0, -2) + "xx", "s")).toBeNull();
    expect(parseSignedRequest("nope", "s")).toBeNull();
    expect(parseSignedRequest(make({ algorithm: "none", user_id: "1" }, "s"), "s")).toBeNull();
  });
});
