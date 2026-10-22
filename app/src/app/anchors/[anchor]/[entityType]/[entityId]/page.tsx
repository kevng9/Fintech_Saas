"use client";

/**
 * Shared entity detail for A1 and A3-A8.
 *
 * A2 keeps its dedicated /anchors/a2/segment and /anchors/a2/payment routes
 * (Next.js matches the static "a2" segment ahead of this dynamic "[anchor]"
 * route, so there is no collision). Every other anchor drills from its
 * overview's drivers panel into this one page, which renders whatever
 * `metrics`/`sections` the anchor's entity() function returned.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SharedEntitySections } from "@/components/anchors/SharedEntitySections";
import { SharedKpiTile } from "@/components/anchors/SharedKpiTile";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Pill, Skeleton } from "@/components/ui";
import type { SharedEntityPayload } from "@/lib/apiTypes";

const TONE_MAP: Record<string, "neutral" | "good" | "warn" | "bad" | "accent"> = {
  neutral: "neutral",
  good: "good",
  warn: "warn",
  bad: "bad",
  accent: "accent",
};

export default function SharedEntityDetailPage() {
  const params = useParams<{ anchor: string; entityType: string; entityId: string }>();
  const anchorId = params.anchor?.toLowerCase() ?? "";
  const entityType = params.entityType ?? "";
  const entityId = decodeURIComponent(params.entityId ?? "");
  const { envelope, config } = useDemoState();
  const [data, setData] = useState<SharedEntityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anchorSummary = config?.anchors.find((item) => item.id === anchorId);
  const stateSignature = envelope
    ? `${envelope.state.run_id}:${envelope.state.logical_time}`
    : "none";

  useEffect(() => {
    if (!anchorId || !entityType || !entityId) return;
    let canceled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/anchors/${anchorId}/entities/${entityType}/${encodeURIComponent(entityId)}?window=60`,
          { cache: "no-store" }
        );
        if (canceled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
          setError(body.error?.message ?? `Entity detail unavailable (${response.status}).`);
          return;
        }
        setData((await response.json()) as SharedEntityPayload);
        setError(null);
      } catch {
        if (!canceled) setError("Cannot reach the demo API.");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [anchorId, entityType, entityId, stateSignature]);

  return (
    <div className="space-y-5">
      <nav className="text-[12px] text-[var(--ink-muted)]">
        <Link href={`/anchors/${anchorId}`} className="hover:underline">
          {anchorSummary?.name ?? anchorId.toUpperCase()}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="mono">{entityId}</span>
      </nav>

      {error && <Banner tone="bad">{error}</Banner>}

      {!data ? (
        <Card title="Entity detail">
          <Skeleton rows={6} />
        </Card>
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">{data.header.title}</h1>
              {data.header.subtitle && (
                <p className="mt-1 text-[13px] text-[var(--ink-soft)]">{data.header.subtitle}</p>
              )}
            </div>
            {data.header.pills && data.header.pills.length > 0 && (
              <div className="flex items-center gap-1.5">
                {data.header.pills.map((pill) => (
                  <Pill key={pill.label} tone={TONE_MAP[pill.tone ?? "neutral"] ?? "neutral"}>
                    {pill.label}
                  </Pill>
                ))}
              </div>
            )}
          </header>

          {data.metrics.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.metrics.map((kpi) => (
                <SharedKpiTile key={kpi.id} kpi={kpi} />
              ))}
            </div>
          )}

          <SharedEntitySections sections={data.sections} />
        </>
      )}
    </div>
  );
}
