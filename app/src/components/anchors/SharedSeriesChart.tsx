"use client";

/**
 * Generic multi-series line chart for the shared overview payload.
 *
 * Each series is scaled to its own min/max so metrics with different units
 * (a rate and a dollar total, say) can share one plot area without a series
 * with a small range collapsing to a flat line.
 */

import { useId } from "react";
import { formatMetric } from "@/lib/format";
import type { SharedSeriesPayload } from "@/lib/apiTypes";

const PAD = { top: 12, right: 16, bottom: 22, left: 16 };
const LINE_COLORS = ["var(--accent)", "var(--amber)", "var(--danger)", "var(--good)"];

export function SharedSeriesChart({
  data,
  height = 200,
}: {
  data: SharedSeriesPayload;
  height?: number;
}) {
  const gradientId = useId();
  const points = data.points;
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-[12px] text-[var(--ink-muted)]">
        Not enough logical periods have elapsed to draw a trend yet.
      </p>
    );
  }

  const width = 900;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotWidth;

  const seriesRanges = data.series.map((series) => {
    const values = points.map((point) => Number(point[series.key] ?? 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min || Math.abs(max) || 1) * 0.12;
    return { min: min - pad, max: max + pad };
  });

  const yFor = (seriesIndex: number, value: number) => {
    const { min, max } = seriesRanges[seriesIndex];
    return PAD.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
  };

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={data.title}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={PAD.left}
            x2={PAD.left + plotWidth}
            y1={PAD.top + fraction * plotHeight}
            y2={PAD.top + fraction * plotHeight}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        {data.series.map((series, seriesIndex) => {
          const path = points
            .map((point, i) => `${i ? "L" : "M"}${x(i)},${yFor(seriesIndex, Number(point[series.key] ?? 0))}`)
            .join(" ");
          const areaPath =
            seriesIndex === 0
              ? `${path} L${x(points.length - 1)},${PAD.top + plotHeight} L${PAD.left},${
                  PAD.top + plotHeight
                } Z`
              : null;
          const color = LINE_COLORS[seriesIndex % LINE_COLORS.length];
          return (
            <g key={series.key}>
              {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={seriesIndex === 0 ? 2 : 1.5}
                strokeDasharray={seriesIndex === 0 ? undefined : "4 3"}
              />
              {points.map((point, i) => (
                <circle
                  key={`${series.key}-${i}`}
                  cx={x(i)}
                  cy={yFor(seriesIndex, Number(point[series.key] ?? 0))}
                  r="2"
                  fill={color}
                >
                  <title>
                    {String(point[data.xKey])} · {series.label}{" "}
                    {formatMetric(Number(point[series.key] ?? 0), series.format)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`label-${index}`}
              x={x(index)}
              y={height - 6}
              textAnchor="middle"
              fontSize="9"
              fill="var(--ink-muted)"
            >
              {String(point[data.xKey])}
            </text>
          ) : null
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-[var(--ink-muted)]">
        {data.series.map((series, index) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-4"
              style={{
                background:
                  index === 0
                    ? LINE_COLORS[0]
                    : `repeating-linear-gradient(90deg, ${LINE_COLORS[index % LINE_COLORS.length]} 0 4px, transparent 4px 7px)`,
              }}
            />
            {series.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
