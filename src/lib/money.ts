/** Exact decimal -> integer cents (half up on the 3rd decimal). Avoids 1.005 * 100 === 100.49999. */
export function decimalToCents(n: number): number {
  if (!Number.isFinite(n)) throw new RangeError("amount is not finite");
  const abs = Math.abs(n);
  const text = abs < 1e-6 || abs >= 1e21 ? abs.toFixed(6) : String(abs);
  const [int, frac = ""] = text.split(".");
  const digits = frac.padEnd(3, "0");
  let cents = Number(int) * 100 + Number(digits.slice(0, 2));
  if (digits.charCodeAt(2) >= 53) cents += 1;
  return n < 0 && cents > 0 ? -cents : cents;
}

/**
 * Parses user input like "1.234,56", "5,99", "R$ 10", "5.99" into cents. Returns null if invalid.
 * A lone "." followed by 1-2 digits is a decimal separator; followed by 3 digits it is thousands.
 */
export function parseBRLToCents(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "" || !/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\.|$)/.test(s) && s.split(".").length > 1 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? decimalToCents(n) : null;
}

/** "4,99" / "4.99" -> 4.99 (percent), null if invalid. */
export function parsePercent(input: string): number | null {
  const s = input.replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}
