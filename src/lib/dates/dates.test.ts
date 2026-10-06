import { describe, expect, it } from "vitest";
import { resolvePeriod, startOfDayInTz } from "./index";

const TZ = "America/Sao_Paulo"; // UTC-3, no DST since 2019

describe("startOfDayInTz", () => {
  it("midnight in São Paulo is 03:00Z", () => {
    expect(startOfDayInTz({ y: 2026, m: 6, d: 1 }, TZ).toISOString()).toBe("2026-06-01T03:00:00.000Z");
  });
  it("handles DST zones (New York summer = UTC-4, winter = UTC-5)", () => {
    expect(startOfDayInTz({ y: 2026, m: 7, d: 1 }, "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfDayInTz({ y: 2026, m: 1, d: 15 }, "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("resolvePeriod", () => {
  // 02:00Z on the 10th is still the 9th in São Paulo: UTC and local day must not be mixed.
  const now = new Date("2026-06-10T02:00:00Z");

  it("today uses the project's day, not UTC's", () => {
    const p = resolvePeriod({ preset: "today", tz: TZ, now });
    expect(p.from.toISOString()).toBe("2026-06-09T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-10T03:00:00.000Z");
  });
  it("yesterday is a full local day", () => {
    const p = resolvePeriod({ preset: "yesterday", tz: TZ, now });
    expect(p.from.toISOString()).toBe("2026-06-08T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-09T03:00:00.000Z");
  });
  it("last 7 days includes today", () => {
    const p = resolvePeriod({ preset: "last_7", tz: TZ, now });
    expect(p.from.toISOString()).toBe("2026-06-03T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-10T03:00:00.000Z");
  });
  it("month presets", () => {
    const now2 = new Date("2026-03-15T12:00:00Z");
    const cur = resolvePeriod({ preset: "this_month", tz: TZ, now: now2 });
    expect(cur.from.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    const prev = resolvePeriod({ preset: "last_month", tz: TZ, now: now2 });
    expect(prev.from.toISOString()).toBe("2026-02-01T03:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2026-03-01T03:00:00.000Z");
  });
  it("custom range is inclusive of the last day; invalid falls back", () => {
    const p = resolvePeriod({ preset: "custom", tz: TZ, now, customFrom: "2026-05-01", customTo: "2026-05-31" });
    expect(p.from.toISOString()).toBe("2026-05-01T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-01T03:00:00.000Z");
    expect(resolvePeriod({ preset: "custom", tz: TZ, now, customFrom: "x", customTo: "y" }).preset).toBe("last_7");
    expect(resolvePeriod({ preset: "custom", tz: TZ, now, customFrom: "2026-02-30", customTo: "2026-03-01" }).preset).toBe("last_7");
  });
});
