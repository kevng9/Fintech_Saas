/**
 * Display formatting shared by every widget.
 *
 * Demo numbers are read aloud from a stage, so precision is fixed per metric
 * type rather than chosen per call site: an approval rate always shows two
 * decimals, latency is always whole milliseconds, and money is always USD
 * because the fact table carries a normalized `amount_usd` alongside the local
 * amount.
 */

const numberFormat = new Intl.NumberFormat("en-US");

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdPreciseFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return numberFormat.format(Number(value));
}

const analystRateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const analystDecimalFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const SNAKE_CASE_LABELS: Record<string, string> = {
  straight_through: "Straight-through",
  manual_review: "Manual review",
};

function analystNumber(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function identifierColumn(column: string): boolean {
  return /\b(id|code|key|uuid|token)\b/i.test(column);
}

function rateColumn(column: string): boolean {
  return /%|\b(rate|percent|pct|ratio)\b/i.test(column);
}

function durationColumn(column: string): boolean {
  return /\b(minute|minutes|hour|hours|second|seconds|latency|duration|turnaround)\b/i.test(column);
}

/** Display label for a categorical Analyst cell, leaving ids and free text unchanged. */
export function analystLabel(value: string): string {
  const known = SNAKE_CASE_LABELS[value];
  if (known) return known;
  if (!/^[a-z]+(?:_[a-z]+)+$/.test(value)) return value;
  const sentence = value.replaceAll("_", " ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Stage formatting for an Analyst result cell.
 *
 * Query payloads often return rates and durations as full-precision strings.
 * Rate columns on a 0–1 scale become percentages; columns already marked with
 * % stay on that scale. Identifiers stay literal.
 */
export function formatAnalystCell(value: string | number | null, column: string): string {
  if (value === null) return "—";
  if (typeof value === "string" && identifierColumn(column)) return value;
  const numeric = analystNumber(value);
  if (numeric === null) return typeof value === "string" ? analystLabel(value) : String(value);
  if (rateColumn(column)) {
    const alreadyPercent = column.includes("%") || Math.abs(numeric) > 1;
    const points = alreadyPercent ? numeric : numeric * 100;
    const formatted = analystRateFormat.format(points);
    return alreadyPercent ? formatted : `${formatted}%`;
  }
  if (durationColumn(column)) return analystDecimalFormat.format(numeric);
  if (Math.abs(numeric - Math.round(numeric)) < 1e-9) return count(Math.round(numeric));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric);
}

/** Same cell formatting, with a unit in the prose when the column name carries one. */
export function formatAnalystProseValue(value: string | number | null, column: string): string | null {
  const formatted = formatAnalystCell(value, column);
  if (formatted === "—") return null;
  if (rateColumn(column) && !formatted.endsWith("%")) return `${formatted}%`;
  if (/\bminutes?\b/i.test(column) && !/minute/i.test(formatted)) return `${formatted} minutes`;
  if (/\bhours?\b/i.test(column) && !/hour/i.test(formatted)) return `${formatted} hours`;
  if (/\bseconds?\b/i.test(column) && !/second/i.test(formatted)) return `${formatted} seconds`;
  if (/\b(ms|milliseconds)\b/i.test(column) && !/ms/i.test(formatted)) return `${formatted} ms`;
  return formatted;
}

/** True when every populated cell is numeric, so the column can align right. */
export function analystColumnIsNumeric(
  column: string,
  values: (string | number | null)[]
): boolean {
  if (identifierColumn(column)) return false;
  let seen = false;
  for (const value of values) {
    if (value === null) continue;
    if (analystNumber(value) === null) return false;
    seen = true;
  }
  return seen;
}

export function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function points(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  const scaled = Number(value) * 100;
  return `${scaled >= 0 ? "+" : "−"}${Math.abs(scaled).toFixed(digits)} pts`;
}

export function milliseconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${numberFormat.format(Math.round(Number(value)))} ms`;
}

export function millisecondsDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(Number(value));
  return `${rounded >= 0 ? "+" : "−"}${numberFormat.format(Math.abs(rounded))} ms`;
}

export function usd(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined) return "—";
  return (precise ? usdPreciseFormat : usdFormat).format(Number(value));
}

export function localAmount(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/**
 * Renders a logical timestamp.
 *
 * The engine returns naive strings ("2026-07-25 09:00:00.000000") that describe
 * demo-internal logical time, not the viewer's wall clock. They are formatted
 * verbatim so the page never shifts them into a local timezone and never
 * disagrees with the value the simulator wrote.
 */
export function logicalTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [date, time = ""] = value.replace("T", " ").replace("Z", "").split(" ");
  return `${date} ${time.slice(0, 8)}`.trim();
}

export function logicalClock(value: string | null | undefined): string {
  if (!value) return "—";
  const [, time = ""] = value.replace("T", " ").replace("Z", "").split(" ");
  return time.slice(0, 8) || "—";
}

export function logicalDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace("T", " ").split(" ")[0] ?? "—";
}

export type MetricFormat = "percent" | "milliseconds" | "count" | "currency" | "text";

export function formatMetric(value: number | null, format: MetricFormat): string {
  switch (format) {
    case "percent":
      return percent(value);
    case "milliseconds":
      return milliseconds(value);
    case "currency":
      return usd(value);
    case "count":
      return count(value);
    default:
      return value === null ? "—" : String(value);
  }
}

export function formatDelta(value: number | null, format: MetricFormat): string {
  switch (format) {
    case "percent":
      return points(value);
    case "milliseconds":
      return millisecondsDelta(value);
    case "currency":
      return value === null ? "—" : `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`;
    case "count":
      return value === null ? "—" : `${value >= 0 ? "+" : "−"}${count(Math.abs(value))}`;
    default:
      return "—";
  }
}
