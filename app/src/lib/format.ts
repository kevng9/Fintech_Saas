/**
 * Display formatting shared by every widget.
 *
 * Demo numbers are read aloud from a stage, so precision is fixed per metric
 * type rather than chosen per call site: an approval rate always shows two
 * decimals, latency is always whole milliseconds, and money is always USD
 * because the fact table carries a normalised `amount_usd` alongside the local
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
