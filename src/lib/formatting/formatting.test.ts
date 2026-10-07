import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedNumber,
  getDeltaSemantic,
  getMetricColor,
  getMetricSemantic,
} from "./index";

describe("formatCurrency (integer cents)", () => {
  it("formats cents as BRL", () => {
    expect(formatCurrency(140852)).toBe("R$ 1.408,52");
    expect(formatCurrency(0)).toBe("R$ 0,00");
  });
  it("renders unavailable as dash, not zero", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
  });
});

describe("formatSignedCurrency / profit sign rule", () => {
  it("keeps + on profit and - on loss", () => {
    expect(formatSignedCurrency(140852)).toBe("+R$ 1.408,52");
    expect(formatSignedCurrency(-38742)).toBe("-R$ 387,42");
    expect(formatSignedCurrency(0)).toBe("R$ 0,00");
  });
});

describe("ROI display", () => {
  it("positive ROI 0.25 -> +0,25 green", () => {
    expect(formatSignedNumber(0.25)).toBe("+0,25");
    expect(getMetricColor(getMetricSemantic(0.25))).toBe("text-success");
  });
  it("negative ROI -1/6 -> -0,17 red, sign preserved", () => {
    const roi = -20 / 120;
    expect(formatSignedNumber(roi)).toBe("-0,17");
    expect(getMetricColor(getMetricSemantic(roi))).toBe("text-danger");
  });
  it("zero ROI is neutral 0,00", () => {
    expect(formatSignedNumber(0)).toBe("0,00");
    expect(getMetricSemantic(0)).toBe("neutral");
  });
  it("values rounding to zero never show -0,00", () => {
    expect(formatSignedNumber(-0.001)).toBe("0,00");
    expect(getMetricSemantic(-0.001)).toBe("neutral");
  });
  it("unavailable ROI is a dash", () => {
    expect(formatSignedNumber(null)).toBe("—");
    expect(getMetricSemantic(null)).toBe("unavailable");
  });
});

describe("misc formatting", () => {
  it("formatNumber / formatPercent", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatPercent(0.1315)).toBe("13,15%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("delta semantics honour metric direction", () => {
  it("CPA falling is good, rising is bad", () => {
    expect(getDeltaSemantic(-0.1, "lower_is_better")).toBe("positive");
    expect(getDeltaSemantic(0.1, "lower_is_better")).toBe("negative");
  });
  it("ROAS rising is good", () => {
    expect(getDeltaSemantic(0.182, "higher_is_better")).toBe("positive");
  });
  it("spend is neutral", () => {
    expect(getDeltaSemantic(0.5, "neutral")).toBe("neutral");
  });
});

import { formatRelativeTime } from "./index";

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  it("formats ranges", () => {
    expect(formatRelativeTime("2026-06-01T11:59:40Z", now)).toBe("agora");
    expect(formatRelativeTime("2026-06-01T11:56:00Z", now)).toBe("há 4 min");
    expect(formatRelativeTime("2026-06-01T09:00:00Z", now)).toBe("há 3 h");
    expect(formatRelativeTime("2026-05-30T12:00:00Z", now)).toBe("há 2 d");
    expect(formatRelativeTime(null, now)).toBe("—");
  });
});
