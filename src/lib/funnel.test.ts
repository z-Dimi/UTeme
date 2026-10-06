import { describe, expect, it } from "vitest";
import { chartableStages, getConversionFunnel } from "./funnel";

describe("conversion funnel", () => {
  it("keeps Meta stages unavailable (null) when Meta is not connected", () => {
    const f = getConversionFunnel(null, 35);
    expect(f.map((s) => s.value)).toEqual([null, null, null, null, 35]);
    expect(f.at(-1)?.source).toBe("gateway");
    expect(f[0].source).toBe("meta");
  });

  it("is not chartable with a single available stage", () => {
    expect(chartableStages(getConversionFunnel(null, 35))).toEqual([]);
  });

  it("charts available stages and skips unavailable ones without zero-filling", () => {
    const f = getConversionFunnel({ clicks: 274, landingPageViews: null, initiateCheckouts: 112, metaPurchases: 40 }, 35);
    expect(chartableStages(f).map((s) => [s.key, s.value])).toEqual([
      ["clicks", 274],
      ["initiate_checkouts", 112],
      ["meta_purchases", 40],
      ["approved_sales", 35],
    ]);
  });

  it("refuses to draw when a later stage exceeds the first (inconsistent data)", () => {
    const f = getConversionFunnel({ clicks: 10, landingPageViews: null, initiateCheckouts: null, metaPurchases: null }, 35);
    expect(chartableStages(f)).toEqual([]);
  });
});
