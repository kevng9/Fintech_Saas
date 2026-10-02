"use client";

import { Pill } from "@/components/ui";
import { formatDelta, formatMetric, type MetricFormat } from "@/lib/format";
import type { KpiWidget } from "@/lib/apiTypes";

/**
 * A headline metric with its own prior baseline.
 *
 * The baseline is the same lane's preceding seven logical days, so the delta
 * answers "is this unusual for us" rather than "is this a good number in the
 * abstract". Direction of good differs per metric, hence `higherIsBetter`.
 */
export function KpiTile({
  widget,
  higherIsBetter,
  detail,
  showProvenance,
}: {
  widget: KpiWidget | undefined;
  higherIsBetter: boolean;
  detail?: string;
  showProvenance: boolean;
}) {
  if (!widget?.meta) return null;
  const format = widget.meta.metricFormat as MetricFormat;
  const delta = widget.delta;
  const improved = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0;
  const material = delta !== null && Math.abs(delta) > (format === "percent" ? 0.0005 : 1);
  const statusTone = material ? (improved ? "good" : "bad") : "neutral";
  const statusLabel =
    widget.baseline === null
      ? "Observed"
      : material
        ? improved
          ? "Improving"
          : "Needs attention"
        : "Within baseline";

  return (
    <section className="card relative overflow-hidden px-5 py-5">
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: material
            ? improved
              ? "var(--good)"
              : "var(--danger)"
            : "var(--accent)",
          opacity: material ? 1 : 0.55,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="label truncate" title={widget.meta.title}>
            {widget.meta.title}
          </h3>
          {widget.meta.subtitle && (
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-muted)]">
              {widget.meta.subtitle}
            </p>
          )}
        </div>
        <Pill tone={statusTone}>{statusLabel}</Pill>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="metric">{formatMetric(widget.value, format)}</p>
        {material && (
          <span
            className="pb-0.5 text-[12px] font-semibold tabular-nums"
            style={{ color: improved ? "var(--good)" : "var(--danger)" }}
          >
            {formatDelta(delta, format)}
          </span>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--ink-muted)]">
        {widget.baseline !== null && (
          <div className="flex gap-1">
            <dt>7-day baseline</dt>
            <dd className="mono">{formatMetric(widget.baseline, format)}</dd>
          </div>
        )}
        {detail && <div className="mono">{detail}</div>}
      </dl>

      {showProvenance && (
        <p className="mt-2 border-t border-[var(--line)] pt-2 text-[11px] leading-4 text-[var(--ink-muted)]">
          <span className="mono">{widget.meta.sourceTables.join(", ")}</span> · {widget.meta.proofMode}
        </p>
      )}
    </section>
  );
}
