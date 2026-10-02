"use client";

/**
 * Customer-facing value stories that close two common presentation gaps:
 * 1. Why Aura is not "just an LLM connected to our warehouse"
 * 2. Why AI platform spend (tokens / warehouse OPEX) matters to CFOs and FP&A
 *
 * These are Tell-Show-Tell proof modules (P9 / P10). They do not invent vendor
 * bills; cost deltas stay hypotheses until the customer supplies baselines.
 */

import Link from "next/link";
import { Card, Pill } from "@/components/ui";

const CONTRAST = [
  {
    title: "Generic LLM on a warehouse",
    points: [
      "Answers depend on whatever schema and prompts the user invents that day",
      "Often scans broad data to invent SQL, burning tokens and time",
      "Harder to prove meaning, scope, and whether a human still owns the decision",
      "Freshness depends on whatever ETL lag the warehouse currently has",
    ],
  },
  {
    title: "Aura Analyst on SingleStore",
    points: [
      "Questions run against curated Domains with approved metrics and relationships",
      "SQL executes against the live operational foundation, not a separate copy by default",
      "Generated SQL and evidence stay inspectable; regulated actions stay with people",
      "Committed events can be queried as soon as they land in SingleStore",
    ],
  },
];

const COST_LEVERS = [
  {
    title: "One engine for ops and analysis",
    body: "Avoid a second platform hop every time a business question needs current payment, fraud, or liquidity data.",
  },
  {
    title: "Governed context reduces wasted exploration",
    body: "Curated views and Domain instructions keep Analyst on approved meaning, which reduces open-ended schema fishing.",
  },
  {
    title: "Ask once, reuse the decision path",
    body: "The same Domain-backed question can power an operator panel, an embedded experience, or a workflow call without rebuilding a chat stack each time.",
  },
];

export default function ValueStoriesPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-[820px]">
        <p className="label">Value stories</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] sm:text-[34px]">
          Why this is not a chatbot on a warehouse.
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[var(--ink-soft)]">
          Aura combines governed business meaning, live execution, inspectable evidence, and
          reusable decision paths so operational AI can scale with accountability.
        </p>
      </header>

      <section id="why-aura" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">Governed intelligence</Pill>
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">
            Why Aura, not a generic LLM
          </h2>
        </div>
        <p className="max-w-[80ch] text-[13px] leading-6 text-[var(--ink-soft)]">
          Connecting a large language model to data is easy to say and hard to operationalize. What
          matters is governed meaning, live execution, inspectable SQL, and human ownership of the
          decision.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {CONTRAST.map((column) => (
            <Card key={column.title} title={column.title}>
              <ul className="space-y-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                {column.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card
          title="What you can inspect"
          subtitle="Evidence behind an Aura Analyst answer"
        >
          <ol className="list-decimal space-y-2 pl-5 text-[12px] leading-5 text-[var(--ink-soft)]">
            <li>Start from a Domain-backed business question and approved metric definitions.</li>
            <li>Open the generated SQL to verify execution against SingleStore.</li>
            <li>
              Review the supporting data and guardrail: Analyst assembles evidence; people retain
              credit, AML, fraud, and payment actions.
            </li>
            <li>
              Ask again after new events land to see the same governed question reflect current
              rows.
            </li>
          </ol>
          <p className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[12px] leading-5 text-[var(--ink)]">
            Aura is not chat on a dump of tables. It combines governed business context, live SQL
            on SingleStore, and an answer your operators can inspect.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/anchors/a2" className="btn btn-dark">
              Show with Payment Performance Management
            </Link>
            <Link href="/architecture" className="btn">
              Open platform diagram
            </Link>
          </div>
        </Card>

        <Card
          title="One incident, one governed answer"
          subtitle="Verified live Payment Performance Management example"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Decision lane", "P2 / Mastercard / GB"],
              ["Incident approval", "88% vs. 96% baseline"],
              ["Incident latency", "680 ms p95"],
              ["Live answer", "60 seconds"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[12px] bg-[var(--surface-sunk)] p-4">
                <p className="label">{label}</p>
                <p className="mt-2 text-[16px] font-semibold tracking-[-0.02em]">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-[82ch] text-[12px] leading-5 text-[var(--ink-soft)]">
            In the verified synthetic run, Aura returned the affected lane, incident-window rate,
            prior seven-day rate, and p95 latency with inspectable SQL. Payments operations retained
            the routing decision. Runtime is a measured demo result, not a production service-level
            commitment.
          </p>
          <div className="mt-4">
            <Link href="/anchors/a2?story=incident" className="btn btn-dark">
              Open the verified incident
            </Link>
          </div>
        </Card>
      </section>

      <section id="ai-cost" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">CFO and FP&A</Pill>
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">
            AI Platform Economics
          </h2>
        </div>
        <p className="max-w-[80ch] text-[13px] leading-6 text-[var(--ink-soft)]">
          As teams deploy more AI, the bill shows up in two places: model tokens and the warehouses
          those models keep re-querying. The architecture determines whether that spend stays
          predictable.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {COST_LEVERS.map((lever) => (
            <Card key={lever.title} title={lever.title}>
              <p className="text-[12px] leading-5 text-[var(--ink-soft)]">{lever.body}</p>
            </Card>
          ))}
        </div>

        <Card title="Architecture contrast" subtitle="Evaluate with your own usage and cost baseline">
          <ol className="list-decimal space-y-2 pl-5 text-[12px] leading-5 text-[var(--ink-soft)]">
            <li>
              One engine holds operational events and the curated views Aura reads.
            </li>
            <li>
              Contrast with a common pattern: operational store → ETL → warehouse → LLM SQL agent →
              another bill for every exploratory scan.
            </li>
            <li>
              Analyst uses approved Domain context instead of inventing joins across the whole
              estate.
            </li>
            <li>
              Compare the architecture with your AI and warehouse spend baseline; treat savings as
              a hypothesis until validated.
            </li>
          </ol>
          <p className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[12px] leading-5 text-[var(--ink)]">
            When AI becomes part of daily operations, architecture decides whether the token and
            warehouse bill compounds or stays tied to governed, live questions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/architecture" className="btn btn-dark">
              Show the cost architecture
            </Link>
            <Link href="/anchors/a6" className="btn">
              Explore liquidity intelligence
            </Link>
          </div>
        </Card>

        <BannerNote />
      </section>
    </div>
  );
}

function BannerNote() {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
      Cost outcomes depend on your workload, model, and platform baseline. Any savings estimate
      should be validated with your own usage and invoices.
    </div>
  );
}
