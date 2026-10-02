"use client";

/**
 * Single authorization attempt.
 *
 * The deepest drill-down. It exists so the room can see that the aggregate is
 * backed by individual rows, and that those rows are synthetic: no card number,
 * no real customer, no credential of any kind.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Banner, Card, Pill, Skeleton } from "@/components/ui";
import { localAmount, logicalTime, milliseconds, usd } from "@/lib/format";
import type { PaymentSamplePayload } from "@/lib/apiTypes";

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = decodeURIComponent(params.paymentId);
  const [payment, setPayment] = useState<PaymentSamplePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/anchors/a2/entities/payment/${encodeURIComponent(paymentId)}`,
          { cache: "no-store" }
        );
        if (canceled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setError(body.error?.message ?? `Payment unavailable (${response.status}).`);
          return;
        }
        const body = (await response.json()) as { payment: PaymentSamplePayload };
        setPayment(body.payment);
        setError(null);
      } catch {
        if (!canceled) setError("Cannot reach the demo API.");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [paymentId]);

  const laneKey = payment
    ? `${payment.processor_id}|${payment.card_network}|${payment.issuer_country}`
    : null;

  const fields: { label: string; value: string; mono?: boolean }[] = payment
    ? [
        { label: "Payment id", value: payment.payment_id, mono: true },
        { label: "Logical time", value: logicalTime(payment.event_time), mono: true },
        { label: "Processor", value: `${payment.processor_name} (${payment.processor_id})` },
        { label: "Rail", value: payment.rail },
        { label: "Card network", value: payment.card_network },
        { label: "Issuer country", value: payment.issuer_country, mono: true },
        { label: "Merchant", value: `${payment.merchant_name} (${payment.merchant_id})` },
        { label: "Merchant category", value: payment.merchant_category },
        { label: "Synthetic customer", value: payment.customer_id, mono: true },
        {
          label: "Amount",
          value: `${localAmount(payment.amount, payment.currency)} ${payment.currency}`,
          mono: true,
        },
        { label: "Normalized amount", value: usd(payment.amount_usd, true), mono: true },
        { label: "Response code", value: payment.response_code, mono: true },
        { label: "Latency", value: milliseconds(payment.latency_ms), mono: true },
        {
          label: "Origin",
          value: payment.scenario_id ? `Injected by ${payment.scenario_id}` : "Baseline stream",
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <nav className="text-[12px] text-[var(--ink-muted)]">
        <Link href="/anchors/a2" className="hover:underline">
          A2 Payment Performance Management
        </Link>
        {laneKey && (
          <>
            <span className="mx-1.5">/</span>
            <Link
              href={`/anchors/a2/segment/${encodeURIComponent(laneKey)}`}
              className="hover:underline"
            >
              {laneKey.split("|").join(" · ")}
            </Link>
          </>
        )}
        <span className="mx-1.5">/</span>
        <span className="mono">{paymentId}</span>
      </nav>

      {error && <Banner tone="bad">{error}</Banner>}

      <Card
        title="Authorization attempt"
        subtitle="One synthetic event, exactly as stored"
        actions={
          payment ? (
            payment.approved ? (
              <Pill tone="good">approved</Pill>
            ) : (
              <Pill tone="bad">declined · {payment.response_code}</Pill>
            )
          ) : null
        }
        footnote="Synthetic record. No card number, token, or real customer identity exists in this demo."
      >
        {payment ? (
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="flex justify-between gap-4 border-b border-[var(--line)] pb-1.5">
                <dt className="text-[12px] text-[var(--ink-muted)]">{field.label}</dt>
                <dd className={`text-[12px] ${field.mono ? "mono" : ""} text-right`}>
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Skeleton rows={6} />
        )}
      </Card>
    </div>
  );
}
