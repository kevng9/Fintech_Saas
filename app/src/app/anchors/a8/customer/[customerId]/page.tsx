"use client";

/**
 * A8 Explain My Money: the embedded, customer-facing experience.
 *
 * This route is meant to sit inside a bank's own mobile or web app, not on
 * the presenter's stage, so `AppShell` renders it without the operator
 * header, anchor navigation, or control strip (see `isEmbeddedCustomerView`
 * in `components/AppShell.tsx`). The only customer this build supports is
 * the seeded CUST-0001; every other id 404s before any query runs, matching
 * the guardrail that this anchor never shows cross-customer data.
 */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnalystWorkspace } from "@/components/a2/AnalystWorkspace";
import { SharedEntitySections } from "@/components/anchors/SharedEntitySections";
import { SharedKpiTile } from "@/components/anchors/SharedKpiTile";
import { SharedSeriesChart } from "@/components/anchors/SharedSeriesChart";
import { Banner, Card, Skeleton } from "@/components/ui";
import type { SharedOverviewPayload } from "@/lib/apiTypes";

const SUPPORTED_CUSTOMER_ID = "CUST-0001";
const ANCHOR_ID = "a8";

export default function CustomerMoneyPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = decodeURIComponent(params.customerId ?? "");
  const [overview, setOverview] = useState<SharedOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = customerId === SUPPORTED_CUSTOMER_ID;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/v1/anchors/${ANCHOR_ID}/overview?window=1440`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
          setError(body.error?.message ?? `Unavailable (${response.status}).`);
          return;
        }
        setOverview((await response.json()) as SharedOverviewPayload);
        setError(null);
      } catch {
        if (!cancelled) setError("Cannot reach the demo API.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported) {
    return (
      <div className="mx-auto max-w-[520px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--ink-muted)]">
          This demo only supports the seeded customer <span className="mono">{SUPPORTED_CUSTOMER_ID}</span>.
          It never shows another customer&apos;s data.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-5 px-5 py-8">
      <header>
        <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--accent-dark)] uppercase">
          Your money
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">Explain my money</h1>
        <p className="mt-1 text-[13px] leading-6 text-[var(--ink-soft)]">
          Ask about your recent spending and cash flow. Answers are grounded in your own transaction
          history, in plain language.
        </p>
      </header>

      {error && <Banner tone="bad">{error}</Banner>}

      {!overview ? (
        <Card title="Your account">
          <Skeleton rows={4} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {overview.kpis.map((kpi) => (
              <SharedKpiTile key={kpi.id} kpi={kpi} />
            ))}
          </div>

          {overview.series && (
            <Card title={overview.series.title} subtitle={overview.series.subtitle}>
              <SharedSeriesChart data={overview.series} height={160} />
            </Card>
          )}

          {overview.drivers && (
            <SharedEntitySections
              sections={[
                {
                  kind: "table",
                  title: overview.drivers.title,
                  subtitle: overview.drivers.subtitle,
                  columns: overview.drivers.columns,
                  rows: overview.drivers.rows,
                },
              ]}
            />
          )}
        </>
      )}

      <AnalystWorkspace
        anchorId={ANCHOR_ID}
        guardrailText={
          overview?.anchor.guardrailText ??
          "Aura Analyst explains this customer's own transaction history. It does not provide financial or investment advice."
        }
        humanOwnership={overview?.anchor.humanOwnership ?? null}
      />
    </div>
  );
}
