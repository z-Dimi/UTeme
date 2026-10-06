import { describe, expect, it } from "vitest";
import { decimalToCents, parseBRLToCents, parsePercent } from "./money";

describe("decimalToCents", () => {
  it("is exact where float math is not", () => {
    expect(decimalToCents(1.005)).toBe(101);
    expect(decimalToCents(0.29)).toBe(29);
    expect(decimalToCents(197)).toBe(19700);
    expect(decimalToCents(-12.5)).toBe(-1250);
    expect(decimalToCents(-0.001)).toBe(0);
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["5,99", 599],
    ["R$ 10", 1000],
    ["5.99", 599],
    ["1.000", 100000],
    ["0,5", 50],
  ])("%s -> %i", (input, cents) => expect(parseBRLToCents(input)).toBe(cents));
  it.each(["", "abc", "1,2,3x", "1.2.3"])("rejects %j", (input) => expect(parseBRLToCents(input)).toBeNull());
});

describe("parsePercent", () => {
  it("parses and bounds", () => {
    expect(parsePercent("4,99")).toBe(4.99);
    expect(parsePercent("12.15%")).toBe(12.15);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
    expect(parsePercent("x")).toBeNull();
  });
});
