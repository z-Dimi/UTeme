/**
 * Period resolution in the PROJECT timezone. Everything is returned as UTC instants with an
 * exclusive upper bound, so queries are always `>= from and < to`.
 */

export type Preset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_14"
  | "last_30"
  | "this_month"
  | "last_month"
  | "custom";

export const PRESET_LABEL: Record<Preset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7: "Últimos 7 dias",
  last_14: "Últimos 14 dias",
  last_30: "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
  custom: "Personalizado",
};

export type Ymd = { y: number; m: number; d: number };

export const formatYmd = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant at which calendar day y-m-d begins in `tz` (DST safe). */
export function startOfDayInTz({ y, m, d }: Ymd, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let instant = guess - tzOffsetMs(guess, tz);
  instant = guess - tzOffsetMs(instant, tz);
  return new Date(instant);
}

export function todayInTz(now: Date, tz: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function parseYmd(value: string | undefined): Ymd | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  const check = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  return check.getUTCMonth() + 1 === ymd.m && check.getUTCDate() === ymd.d ? ymd : null;
}

export function isPreset(value: string | undefined): value is Preset {
  return !!value && value in PRESET_LABEL;
}

export type Period = { preset: Preset; from: Date; to: Date; label: string };

export function resolvePeriod(args: {
  preset: Preset;
  tz: string;
  now?: Date;
  customFrom?: string;
  customTo?: string;
}): Period {
  const { preset, tz, now = new Date() } = args;
  const today = todayInTz(now, tz);
  const tomorrowStart = startOfDayInTz(addDays(today, 1), tz);
  const at = (ymd: Ymd) => startOfDayInTz(ymd, tz);
  const label = PRESET_LABEL[preset];

  switch (preset) {
    case "today":
      return { preset, from: at(today), to: tomorrowStart, label };
    case "yesterday":
      return { preset, from: at(addDays(today, -1)), to: at(today), label };
    case "last_7":
      return { preset, from: at(addDays(today, -6)), to: tomorrowStart, label };
    case "last_14":
      return { preset, from: at(addDays(today, -13)), to: tomorrowStart, label };
    case "last_30":
      return { preset, from: at(addDays(today, -29)), to: tomorrowStart, label };
    case "this_month":
      return { preset, from: at({ ...today, d: 1 }), to: tomorrowStart, label };
    case "last_month": {
      const firstThis = { ...today, d: 1 };
      const lastDayPrev = addDays(firstThis, -1);
      return { preset, from: at({ ...lastDayPrev, d: 1 }), to: at(firstThis), label };
    }
    case "custom": {
      const from = parseYmd(args.customFrom);
      const to = parseYmd(args.customTo);
      if (from && to && at(from) <= at(to)) {
        return { preset, from: at(from), to: at(addDays(to, 1)), label };
      }
      return resolvePeriod({ preset: "last_7", tz, now });
    }
  }
}
