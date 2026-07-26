"use client";

/**
 * Hand-rolled SVG charts for the deterministic widgets.
 *
 * These render synchronously from the widget payload with no charting library on
 * the critical path, so a widget cannot be the reason a page is slow on stage.
 * Aura Analyst charts are a different case and use Plotly, because the API
 * returns a Plotly figure.
 */

import { useId } from "react";
import { milliseconds, percent } from "@/lib/format";

export interface SeriesPoint {
  label: string;
  rate: number;
  latency: number;
  attempts: number;
}

const PAD = { top: 12, right: 46, bottom: 22, left: 46 };

/**
 * Approval rate and p95 latency over the same logical hours.
 *
 * Two independent y-axes are intentional: the story is "the rate dipped at the
 * same hour the latency spiked", which is only legible when both series keep
 * their own scale.
 */
export function DualAxisChart({
  points,
  height = 200,
  highlightIndex,
}: {
  points: SeriesPoint[];
  height?: number;
  highlightIndex?: number | null;
}) {
  const gradientId = useId();
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-[12px] text-[var(--ink-muted)]">
        Not enough logical hours have elapsed to draw a trend yet.
      </p>
    );
  }

  const width = 900;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;

  const rates = points.map((point) => point.rate);
  const latencies = points.map((point) => point.latency);
  // Pad each axis so a flat baseline is not drawn as a line stuck to an edge.
  const rateMin = Math.min(...rates) - 0.004;
  const rateMax = Math.max(...rates) + 0.004;
  const latencyMax = Math.max(...latencies) * 1.15;

  const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotWidth;
  const yRate = (value: number) =>
    PAD.top + plotHeight - ((value - rateMin) / (rateMax - rateMin || 1)) * plotHeight;
  const yLatency = (value: number) => PAD.top + plotHeight - (value / (latencyMax || 1)) * plotHeight;

  const ratePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${yRate(p.rate)}`).join(" ");
  const latencyPath = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${yLatency(p.latency)}`)
    .join(" ");
  const areaPath = `${ratePath} L${x(points.length - 1)},${PAD.top + plotHeight} L${PAD.left},${
    PAD.top + plotHeight
  } Z`;

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Authorization rate and p95 latency by logical hour"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PAD.top + fraction * plotHeight;
          const rate = rateMax - fraction * (rateMax - rateMin);
          return (
            <g key={fraction}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--ink-muted)">
                {(rate * 100).toFixed(1)}
              </text>
              <text
                x={PAD.left + plotWidth + 6}
                y={y + 3}
                fontSize="9"
                fill="var(--ink-muted)"
              >
                {Math.round(latencyMax - fraction * latencyMax)}
              </text>
            </g>
          );
        })}

        {highlightIndex !== null && highlightIndex !== undefined && points[highlightIndex] && (
          <rect
            x={x(highlightIndex) - plotWidth / points.length / 2}
            y={PAD.top}
            width={plotWidth / points.length}
            height={plotHeight}
            fill="var(--danger)"
            opacity="0.07"
          />
        )}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={latencyPath} fill="none" stroke="var(--amber)" strokeWidth="1.75" strokeDasharray="4 3" />
        <path d={ratePath} fill="none" stroke="var(--accent)" strokeWidth="2" />

        {points.map((point, index) => (
          <g key={point.label}>
            <circle cx={x(index)} cy={yRate(point.rate)} r="2.2" fill="var(--accent)" />
            <title>
              {point.label} · approval {percent(point.rate)} · p95 {milliseconds(point.latency)} ·{" "}
              {point.attempts} attempts
            </title>
          </g>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`label-${point.label}`}
              x={x(index)}
              y={height - 6}
              textAnchor="middle"
              fontSize="9"
              fill="var(--ink-muted)"
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
      <figcaption className="mt-1 flex items-center gap-4 text-[11px] text-[var(--ink-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4" style={{ background: "var(--accent)" }} />
          Approval rate (left, %)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-[2px] w-4"
            style={{
              background:
                "repeating-linear-gradient(90deg, var(--amber) 0 4px, transparent 4px 7px)",
            }}
          />
          p95 latency (right, ms)
        </span>
      </figcaption>
    </figure>
  );
}

/** Signed horizontal bars, used to rank which lane moved most. */
export function DivergingBars({
  rows,
  onSelect,
  selectedKey,
}: {
  rows: { key: string; label: string; value: number | null; detail: string }[];
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}) {
  const magnitude = Math.max(...rows.map((row) => Math.abs(row.value ?? 0)), 0.001);

  return (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        const value = row.value ?? 0;
        const share = Math.min(Math.abs(value) / magnitude, 1) * 50;
        const negative = value < 0;
        const selected = selectedKey === row.key;
        return (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onSelect?.(row.key)}
              className="w-full rounded-[6px] px-1.5 py-1 text-left transition-colors"
              style={{ background: selected ? "var(--accent-soft)" : "transparent" }}
            >
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="mono truncate">{row.label}</span>
                <span
                  className="shrink-0 tabular-nums"
                  style={{ color: negative ? "var(--danger)" : "var(--good)" }}
                >
                  {row.detail}
                </span>
              </div>
              <div className="relative mt-1 h-[6px] rounded-full bg-[var(--surface-sunk)]">
                <span className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-[var(--line-strong)]" />
                <span
                  className="absolute top-0 h-[6px] rounded-full"
                  style={{
                    background: negative ? "var(--danger)" : "var(--good)",
                    width: `${share}%`,
                    left: negative ? `${50 - share}%` : "50%",
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact inline trend used inside table rows and detail headers. */
export function Sparkline({
  values,
  width = 120,
  height = 26,
  tone = "var(--accent)",
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: string;
}) {
  if (values.length < 2) return <span className="text-[11px] text-[var(--ink-muted)]">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke={tone} strokeWidth="1.5" />
    </svg>
  );
}
