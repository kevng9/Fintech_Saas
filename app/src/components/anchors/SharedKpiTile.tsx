"use client";

/**
 * Generic KPI tile for the shared A1 / A3-A8 overview payload.
 *
 * Mirrors `components/a2/KpiTile.tsx` but reads a self-describing
 * `SharedKpiPayload` instead of A2's widget-plus-meta shape, so one component
 * renders every anchor's headline metrics.
 */

import { Pill } from "@/components/ui";
import { formatDelta, formatMetric } from "@/lib/format";
import type { SharedKpiPayload } from "@/lib/apiTypes";

export function SharedKpiTile({ kpi }: { kpi: SharedKpiPayload }) {
  const higherIsBetter = kpi.higherIsBetter ?? true;
  const delta = kpi.delta;
  const improved = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0;
  const material = delta !== null && Math.abs(delta) > (kpi.format === "percent" ? 0.0005 : 1);
  const statusTone =
    kpi.statusTone ??
    (material ? (improved ? "good" : "bad") : "neutral");
  const statusLabel =
    kpi.statusLabel ??
    (kpi.baseline === null
      ? "Observed"
      : material
        ? improved
          ? "Improving"
          : "Needs attention"
        : "Within baseline");

  return (
    <section className="card relative overflow-hidden px-5 py-5">
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: material ? (improved ? "var(--good)" : "var(--danger)") : "var(--accent)",
          opacity: material ? 1 : 0.55,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="label truncate" title={kpi.title}>
            {kpi.title}
          </h3>
          {kpi.subtitle && (
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-muted)]">{kpi.subtitle}</p>
          )}
        </div>
        <Pill tone={statusTone}>{statusLabel}</Pill>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="metric">{formatMetric(kpi.value, kpi.format)}</p>
        {material && (
          <span
            className="pb-0.5 text-[12px] font-semibold tabular-nums"
            style={{ color: improved ? "var(--good)" : "var(--danger)" }}
          >
            {formatDelta(delta, kpi.format)}
          </span>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--ink-muted)]">
        {kpi.baseline !== null && (
          <div className="flex gap-1">
            <dt>Baseline</dt>
            <dd className="mono">{formatMetric(kpi.baseline, kpi.format)}</dd>
          </div>
        )}
        {kpi.detail && <div className="mono">{kpi.detail}</div>}
      </dl>
    </section>
  );
}
