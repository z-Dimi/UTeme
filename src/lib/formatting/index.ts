/**
 * Central formatting + metric semantics.
 * Money is ALWAYS integer cents. `null`/`undefined` means "not available" and
 * renders as "—" (never as zero). Signs are never hidden.
 */

export const UNAVAILABLE = "—";

export type MetricSemantic = "positive" | "negative" | "neutral" | "unavailable";
export type MetricDirection = "higher_is_better" | "lower_is_better" | "neutral";

type Nullable = number | null | undefined;

const nbspToSpace = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

function isAvailable(value: Nullable): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Rounds to `digits` decimals; used so "-0,00" never appears. */
function roundTo(value: number, digits: number) {
  const f = 10 ** digits;
  const r = Math.round((Math.abs(value) + Number.EPSILON) * f) / f;
  return value < 0 ? -r : r;
}

export function formatNumber(value: Nullable, digits = 0): string {
  if (!isAvailable(value)) return UNAVAILABLE;
  return nbspToSpace(
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(roundTo(value, digits) + 0),
  );
}

export function formatSignedNumber(value: Nullable, digits = 2): string {
  if (!isAvailable(value)) return UNAVAILABLE;
  const r = roundTo(value, digits);
  const body = formatNumber(Math.abs(r), digits);
  if (r > 0) return `+${body}`;
  if (r < 0) return `-${body}`;
  return body;
}

/** `cents` is integer minor units. */
export function formatCurrency(cents: Nullable, currency = "BRL"): string {
  if (!isAvailable(cents)) return UNAVAILABLE;
  return nbspToSpace(
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
      roundTo(cents, 0) / 100 + 0,
    ),
  );
}

export function formatSignedCurrency(cents: Nullable, currency = "BRL"): string {
  if (!isAvailable(cents)) return UNAVAILABLE;
  const r = roundTo(cents, 0);
  const body = formatCurrency(Math.abs(r), currency);
  if (r > 0) return `+${body}`;
  if (r < 0) return `-${body}`;
  return body;
}

/** `ratio` 0.25 -> "25,00%". */
export function formatPercent(ratio: Nullable, digits = 2): string {
  if (!isAvailable(ratio)) return UNAVAILABLE;
  return `${formatNumber(ratio * 100, digits)}%`;
}

export function formatSignedPercent(ratio: Nullable, digits = 2): string {
  if (!isAvailable(ratio)) return UNAVAILABLE;
  return `${formatSignedNumber(ratio * 100, digits)}%`;
}

/**
 * Semantic of a value that has an inherent sign (profit, ROI, margin).
 * Value is evaluated after display rounding so "0,00" is neutral.
 */
export function getMetricSemantic(value: Nullable, digits = 2): MetricSemantic {
  if (!isAvailable(value)) return "unavailable";
  const r = roundTo(value, digits);
  if (r > 0) return "positive";
  if (r < 0) return "negative";
  return "neutral";
}

/** Semantic of a period-over-period change, honouring metric direction. */
export function getDeltaSemantic(
  delta: Nullable,
  direction: MetricDirection,
): MetricSemantic {
  const sign = getMetricSemantic(delta);
  if (sign === "unavailable" || sign === "neutral" || direction === "neutral") {
    return sign === "unavailable" ? "unavailable" : "neutral";
  }
  const good = direction === "higher_is_better" ? sign === "positive" : sign === "negative";
  return good ? "positive" : "negative";
}

export function getMetricColor(semantic: MetricSemantic): string {
  switch (semantic) {
    case "positive":
      return "text-success";
    case "negative":
      return "text-danger";
    default:
      return "text-muted";
  }
}

/** "agora", "há 4 min", "há 3 h", "há 2 d". `now` is injected so it stays pure/testable. */
export function formatRelativeTime(iso: string | null | undefined, now: Date): string {
  if (!iso) return UNAVAILABLE;
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 1440) return `há ${Math.round(diffMin / 60)} h`;
  return `há ${Math.round(diffMin / 1440)} d`;
}
