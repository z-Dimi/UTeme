import { describe, expect, it } from "vitest";
import { conversionCount, conversionValueCents, mapInsightRow, outboundClicks } from "./actions";

describe("meta action mapper", () => {
  const actions = [
    { action_type: "link_click", value: "274" },
    { action_type: "omni_purchase", value: "40" },
    { action_type: "purchase", value: "40" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "38" },
    { action_type: "landing_page_view", value: "195" },
  ];

  it("takes ONE action type per event instead of summing duplicates", () => {
    expect(conversionCount(actions, "purchase")).toBe(40); // not 118
    expect(conversionCount(actions, "landing_page_view")).toBe(195);
  });

  it("falls back down the priority list", () => {
    expect(conversionCount([{ action_type: "offsite_conversion.fb_pixel_purchase", value: "7" }], "purchase")).toBe(7);
    expect(conversionCount([{ action_type: "purchase", value: "3" }], "purchase")).toBe(3);
  });

  it("returns 0 when Meta reported no such event", () => {
    expect(conversionCount(undefined, "purchase")).toBe(0);
    expect(conversionCount(actions, "lead")).toBe(0);
  });

  it("converts purchase value to cents without float drift", () => {
    const values = [{ action_type: "omni_purchase", value: "7880.10" }, { action_type: "purchase", value: "7880.10" }];
    expect(conversionValueCents(values, "purchase")).toBe(788010);
    expect(conversionValueCents([{ action_type: "purchase", value: "1.005" }], "purchase")).toBe(101);
  });

  it("reads outbound clicks", () => {
    expect(outboundClicks([{ action_type: "outbound_click", value: "55" }])).toBe(55);
    expect(outboundClicks(undefined)).toBe(0);
  });

  it("maps an insight row to cents and counts", () => {
    const m = mapInsightRow(
      {
        date_start: "2026-06-01",
        campaign_id: "c1",
        adset_id: "s1",
        ad_id: "a1",
        spend: "123.45",
        impressions: "1000",
        clicks: "50",
        inline_link_clicks: "40",
        actions,
        action_values: [{ action_type: "omni_purchase", value: "500.00" }],
      },
      "act_1",
    );
    expect(m).toMatchObject({ spend: 12345, impressions: 1000, meta_purchases: 40, meta_purchase_value: 50000, landing_page_views: 195 });
  });

  it("skips rows with no ad id", () => {
    expect(mapInsightRow({ date_start: "2026-06-01", spend: "1" }, "act_1")).toBeNull();
  });
});
