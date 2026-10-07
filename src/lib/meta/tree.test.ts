import { describe, expect, it } from "vitest";
import { buildMetaTree, sortNodes, type RollupRow } from "./tree";

const row = (over: Partial<RollupRow>): RollupRow => ({
  campaign_id: "c1",
  adset_id: "s1",
  ad_id: "a1",
  spend: 0,
  impressions: 0,
  clicks: 0,
  inline_link_clicks: 0,
  meta_purchases: 0,
  meta_purchase_value: 0,
  ...over,
});

const names = {
  campaigns: new Map([["c1", { name: "Camp 1", status: "ACTIVE" }]]),
  adsets: new Map([["s1", { name: "Set 1", status: "ACTIVE" }]]),
  ads: new Map([["a1", { name: "Ad 1", status: "PAUSED" }]]),
};

describe("buildMetaTree", () => {
  const rows = [
    row({ ad_id: "a1", spend: 10000, impressions: 1000, clicks: 50, meta_purchases: 2, meta_purchase_value: 40000 }),
    row({ ad_id: "a2", spend: 5000, impressions: 500, clicks: 10, meta_purchases: 0, meta_purchase_value: 0 }),
    row({ campaign_id: "c2", adset_id: "s9", ad_id: "a9", spend: 20000, impressions: 4000, clicks: 80, meta_purchases: 1, meta_purchase_value: 10000 }),
  ];
  const tree = buildMetaTree(rows, names);

  it("parents are the sum of their children", () => {
    const c1 = tree.find((n) => n.id === "c1")!;
    expect(c1.sums.spend).toBe(15000);
    expect(c1.children[0].children.map((a) => a.sums.spend)).toEqual([10000, 5000]);
    expect(c1.children[0].sums.spend).toBe(c1.sums.spend);
  });

  it("derives CTR, CPC, CPM, CPA and ROAS from the summed values (not averages of ratios)", () => {
    const c1 = tree.find((n) => n.id === "c1")!;
    expect(c1.derived.ctr).toBeCloseTo(60 / 1500);
    expect(c1.derived.cpc).toBe(250); // 15000 / 60
    expect(c1.derived.cpm).toBe(10000); // 15000 / 1500 * 1000
    expect(c1.derived.cpa).toBe(7500);
    expect(c1.derived.roas).toBeCloseTo(40000 / 15000);
  });

  it("uses names when known and falls back to the id (never invents a label)", () => {
    const c1 = tree.find((n) => n.id === "c1")!;
    expect(c1.name).toBe("Camp 1");
    expect(c1.children[0].children[1].name).toBe("a2");
    expect(tree.find((n) => n.id === "c2")!.name).toBe("c2");
  });

  it("zero-division metrics are null, not Infinity", () => {
    const t = buildMetaTree([row({ spend: 100 })], names);
    expect(t[0].derived).toEqual({ ctr: null, cpc: null, cpm: null, cpa: null, roas: 0 });
  });

  it("sorts with unavailable values last in both directions", () => {
    const nodes = tree;
    expect(sortNodes(nodes, "spend", "desc").map((n) => n.id)).toEqual(["c2", "c1"]);
    const withNull = buildMetaTree([row({ spend: 1, meta_purchases: 1, meta_purchase_value: 5 }), row({ campaign_id: "c3", adset_id: "s3", ad_id: "a3", spend: 9 })], names);
    expect(sortNodes(withNull, "cpa", "asc").map((n) => n.id)).toEqual(["c1", "c3"]);
    expect(sortNodes(withNull, "cpa", "desc").map((n) => n.id)).toEqual(["c1", "c3"]);
  });
});
