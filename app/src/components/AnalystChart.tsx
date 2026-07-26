"use client";

/**
 * Renders an Aura Analyst chart.
 *
 * The API returns a Plotly figure, so Plotly is the honest renderer here. It is
 * imported lazily and only mounted when a chart actually arrives, keeping it off
 * the initial page load for the deterministic widgets.
 */

import { useEffect, useRef, useState } from "react";

type PlotlyModule = {
  newPlot: (
    element: HTMLElement,
    data: unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>
  ) => Promise<unknown>;
  purge: (element: HTMLElement) => void;
};

let plotlyPromise: Promise<PlotlyModule> | null = null;

function loadPlotly(): Promise<PlotlyModule> {
  plotlyPromise ??= import("plotly.js-dist-min").then(
    (module) => (module.default ?? module) as unknown as PlotlyModule
  );
  return plotlyPromise;
}

const BASE_LAYOUT: Record<string, unknown> = {
  margin: { l: 52, r: 18, t: 24, b: 40 },
  height: 300,
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif", size: 11 },
  colorway: ["#4b3df5", "#0f9b8e", "#b7791f", "#c62b3f", "#46536b"],
};

export function AnalystChart({
  data,
  layout,
}: {
  data: unknown[];
  layout: Record<string, unknown>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let element: HTMLElement | null = container.current;
    let cancelled = false;
    void loadPlotly()
      .then((plotly) => {
        if (cancelled || !element) return;
        return plotly.newPlot(element, data, { ...BASE_LAYOUT, ...layout }, {
          displayModeBar: false,
          responsive: true,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (element) {
        void loadPlotly().then((plotly) => {
          try {
            if (element) plotly.purge(element);
          } catch {
            // The node is already detached; nothing to clean up.
          }
          element = null;
        });
      }
    };
  }, [data, layout]);

  if (failed) {
    return (
      <p className="py-4 text-[12px] text-[var(--ink-muted)]">
        The chart could not be rendered. The table below carries the same answer.
      </p>
    );
  }
  return <div ref={container} className="w-full" />;
}
