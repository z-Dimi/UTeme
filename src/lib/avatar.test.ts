import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, sniffImage, validateAvatar } from "./avatar";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("avatar validation", () => {
  it("detects the real type from magic bytes", () => {
    expect(sniffImage(png)).toBe("png");
    expect(sniffImage(jpg)).toBe("jpeg");
    expect(sniffImage(webp)).toBe("webp");
    expect(sniffImage(html)).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("accepts valid images", () => {
    expect(validateAvatar({ size: png.length, type: "image/png" }, png)).toEqual({ ok: true, kind: "png", contentType: "image/png" });
    expect(validateAvatar({ size: jpg.length, type: "image/jpeg" }, jpg).ok).toBe(true);
  });

  it("rejects disguised files, wrong declared types, empty and oversized files", () => {
    expect(validateAvatar({ size: html.length, type: "image/png" }, html).ok).toBe(false);
    expect(validateAvatar({ size: png.length, type: "image/jpeg" }, png).ok).toBe(false);
    expect(validateAvatar({ size: 0, type: "image/png" }, new Uint8Array()).ok).toBe(false);
    expect(validateAvatar({ size: AVATAR_MAX_BYTES + 1, type: "image/png" }, png).ok).toBe(false);
  });
});
