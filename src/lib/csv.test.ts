import { describe, expect, it } from "vitest";
import { centsToDecimal, csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("l1\nl2")).toBe('"l1\nl2"');
  });
  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("does not touch numbers, even negative ones", () => {
    expect(csvCell(-5)).toBe("-5");
  });
  it("builds rows with BOM and CRLF", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("﻿a,b\r\n1,\r\n");
  });
  it("formats cents", () => {
    expect(centsToDecimal(19700)).toBe("197.00");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(0)).toBe("0.00");
  });
});
