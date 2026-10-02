/**
 * Turns a raw Analyst result into the commentary shape the response window
 * expects when the model returns a table without that prose.
 *
 * The words are assembled only from cells in the returned table. They state
 * the measured comparison and stop short of a causal claim.
 */

import { analystLabel, formatAnalystCell, formatAnalystProseValue } from "@/lib/format";

export interface CommentaryTable {
  columns: string[];
  rows: (string | number | null)[][];
  truncated?: boolean;
}

const EMPTY_CELL = /^[-—–]$/i;

function readNumber(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed || EMPTY_CELL.test(trimmed)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function filledCount(table: CommentaryTable): number {
  let count = 0;
  for (const row of table.rows) {
    for (const value of row) {
      if (value === null) continue;
      if (typeof value === "string" && (!value.trim() || EMPTY_CELL.test(value.trim()))) continue;
      count += 1;
    }
  }
  return count;
}

function metricName(column: string): string {
  return column
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\bavg\b/gi, "average")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRateColumn(column: string): boolean {
  return /%|\b(rate|percent|pct|ratio)\b/i.test(column);
}

function isDurationColumn(column: string): boolean {
  return /\b(minute|minutes|hour|hours|second|seconds|latency|duration|turnaround)\b/i.test(column);
}

function isVolumeColumn(column: string): boolean {
  return /\b(applications?|volume|count|attempts?|transactions?|sessions?|alerts?|cases?|disputes?)\b/i.test(
    column
  ) && !/\b(approved|declined|rate|percent)\b/i.test(column);
}

function labelColumnIndex(table: CommentaryTable): number {
  const scores = table.columns.map((_, index) => {
    let labels = 0;
    let numbers = 0;
    for (const row of table.rows) {
      const value = row[index] ?? null;
      if (value === null || (typeof value === "string" && EMPTY_CELL.test(value.trim()))) continue;
      if (readNumber(value) === null) labels += 1;
      else numbers += 1;
    }
    return labels - numbers;
  });
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[best]) best = index;
  }
  return scores[best] > 0 ? best : -1;
}

function rowLabel(table: CommentaryTable, row: (string | number | null)[], labelIndex: number): string {
  if (labelIndex < 0) return "This group";
  const value = row[labelIndex];
  if (value === null) return "This group";
  return analystLabel(String(value));
}

function bold(value: string): string {
  return `**${value}**`;
}

function labelsOf(table: CommentaryTable): string[] {
  const index = labelColumnIndex(table);
  return table.rows
    .map((row) => rowLabel(table, row, index).toLowerCase())
    .filter((label) => label !== "this group")
    .sort();
}

function numberSet(table: CommentaryTable): Set<string> {
  const values = new Set<string>();
  table.columns.forEach((column, index) => {
    if (index === labelColumnIndex(table)) return;
    for (const row of table.rows) {
      const formatted = formatAnalystCell(row[index] ?? null, column);
      if (formatted !== "—") values.add(formatted);
    }
  });
  return values;
}

function sameLabels(left: string[], right: string[]): boolean {
  return left.length > 0 && left.length === right.length && left.every((label, index) => label === right[index]);
}

function isSubset(smaller: Set<string>, larger: Set<string>): boolean {
  if (!smaller.size || smaller.size > larger.size) return false;
  for (const value of smaller) {
    if (!larger.has(value)) return false;
  }
  return true;
}

/** Drops sparse and repeated result grids so one comparison is shown once. */
export function selectAnalystTables<T extends CommentaryTable>(tables: T[]): T[] {
  const usable = tables.filter((table) => table.columns.length && table.rows.length);
  if (usable.length <= 1) return usable;

  const ranked = usable.map((table, index) => ({
    table,
    index,
    fill: filledCount(table),
    labels: labelsOf(table),
    numbers: numberSet(table),
  }));
  const bestFill = Math.max(...ranked.map((item) => item.fill));
  const kept: typeof ranked = [];

  for (const candidate of ranked) {
    const cells = Math.max(1, candidate.table.columns.length * candidate.table.rows.length);
    if (candidate.fill / cells < 0.5 && candidate.fill < bestFill) continue;
    if (kept.some((prior) => sameLabels(prior.labels, candidate.labels) && isSubset(candidate.numbers, prior.numbers))) {
      continue;
    }
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      const prior = kept[index];
      if (
        sameLabels(prior.labels, candidate.labels) &&
        isSubset(prior.numbers, candidate.numbers) &&
        candidate.numbers.size > prior.numbers.size
      ) {
        kept.splice(index, 1);
      }
    }
    kept.push(candidate);
  }

  if (!kept.length) {
    const fullest = ranked.reduce((best, item) => (item.fill > best.fill ? item : best));
    return [fullest.table];
  }
  return kept.sort((left, right) => left.index - right.index).map((item) => item.table);
}

export function proseHasCommentaryShape(text: string): boolean {
  return /(^|\n)\s*[-*]\s+\S/.test(text);
}

interface ScoredRow {
  label: string;
  row: (string | number | null)[];
  primary: number;
}

function columnIndex(table: CommentaryTable, predicate: (column: string) => boolean): number {
  return table.columns.findIndex(predicate);
}

function proseValue(row: (string | number | null)[], table: CommentaryTable, index: number): string | null {
  if (index < 0) return null;
  return formatAnalystProseValue(row[index] ?? null, table.columns[index] ?? "");
}

function percentagePointGap(left: number, right: number, column: string): string {
  const alreadyPercent = column.includes("%") || Math.max(Math.abs(left), Math.abs(right)) > 1;
  const gap = Math.abs(alreadyPercent ? left - right : (left - right) * 100);
  return `${gap.toFixed(2)} percentage-point`;
}

function closingSentence(): string {
  return "The result describes the measured difference in this dataset. It should not by itself be read as a causal effect.";
}

/** Builds the opening sentence, key-figure bullets, and closing sentence from one table. */
export function buildDatasetCommentary(table: CommentaryTable): string | null {
  if (!table.columns.length || !table.rows.length) return null;
  const labelIndex = labelColumnIndex(table);
  const rateIndex = columnIndex(table, isRateColumn);
  const volumeIndex = columnIndex(table, isVolumeColumn);
  const durationIndex = columnIndex(table, isDurationColumn);
  const primaryIndex =
    rateIndex >= 0
      ? rateIndex
      : table.columns.findIndex((_, index) => index !== labelIndex && table.rows.some((row) => readNumber(row[index] ?? null) !== null));
  if (primaryIndex < 0) return null;

  const scored: ScoredRow[] = table.rows
    .map((row) => ({
      label: rowLabel(table, row, labelIndex),
      row,
      primary: readNumber(row[primaryIndex] ?? null),
    }))
    .filter((item): item is ScoredRow & { primary: number } => item.primary !== null)
    .sort((left, right) => right.primary - left.primary);
  if (!scored.length) return null;

  const primaryColumn = table.columns[primaryIndex];
  const primaryMetric = metricName(primaryColumn);
  const top = scored[0];
  const bottom = scored[scored.length - 1];
  const topFigure = proseValue(top.row, table, primaryIndex);
  const bottomFigure = proseValue(bottom.row, table, primaryIndex);
  if (!topFigure) return null;

  const opening =
    scored.length === 1 || top.primary === bottom.primary
      ? `${bold(top.label)} ${scored.length === 1 ? "is shown" : "matches the other rows"} at ${bold(topFigure)} ${primaryMetric}.`
      : scored.length > 2
        ? `${bold(top.label)} has the highest ${primaryMetric}, at ${bold(topFigure)}.`
        : `${bold(top.label)} has the higher ${primaryMetric}, at ${bold(topFigure)} versus ${bold(bottomFigure ?? topFigure)} for ${bold(bottom.label)}.`;

  const bullets: string[] = [];
  if (scored.length >= 2 && volumeIndex >= 0 && rateIndex >= 0) {
    const topVolume = proseValue(top.row, table, volumeIndex);
    const bottomVolume = proseValue(bottom.row, table, volumeIndex);
    const topRate = proseValue(top.row, table, rateIndex);
    const bottomRate = proseValue(bottom.row, table, rateIndex);
    if (topVolume && bottomVolume && topRate && bottomRate) {
      const noun = /\bapplications?\b/i.test(table.columns[volumeIndex])
        ? "applications"
        : metricName(table.columns[volumeIndex]);
      bullets.push(
        `${bold(top.label)} has ${bold(topVolume)} ${noun} at ${bold(topRate)}, compared with ${bold(bottomVolume)} ${noun} at ${bold(bottomRate)} for ${bold(bottom.label)}.`
      );
    }
  }
  if (scored.length >= 2 && rateIndex >= 0 && top.primary !== bottom.primary) {
    const left = readNumber(top.row[rateIndex] ?? null);
    const right = readNumber(bottom.row[rateIndex] ?? null);
    if (left !== null && right !== null) {
      bullets.push(
        `That is a ${bold(percentagePointGap(left, right, table.columns[rateIndex]))} difference in ${metricName(table.columns[rateIndex])}.`
      );
    }
  }
  if (scored.length >= 2 && durationIndex >= 0) {
    const topDuration = proseValue(top.row, table, durationIndex);
    const bottomDuration = proseValue(bottom.row, table, durationIndex);
    if (topDuration && bottomDuration) {
      const durationMetric = metricName(table.columns[durationIndex]);
      const durationLabel = durationMetric.charAt(0).toUpperCase() + durationMetric.slice(1);
      bullets.push(
        `${durationLabel} is ${bold(topDuration)} for ${bold(top.label)} and ${bold(bottomDuration)} for ${bold(bottom.label)}.`
      );
    }
  }
  if (!bullets.length) {
    const extraIndexes = [volumeIndex, durationIndex, rateIndex, primaryIndex].filter(
      (index, position, all) => index >= 0 && all.indexOf(index) === position
    );
    for (const item of scored.slice(0, 3)) {
      const parts = extraIndexes
        .map((index) => {
          const figure = proseValue(item.row, table, index);
          return figure ? `${bold(figure)} ${metricName(table.columns[index])}` : null;
        })
        .filter((part): part is string => Boolean(part));
      if (parts.length) bullets.push(`${bold(item.label)}: ${parts.join(", ")}.`);
    }
  }

  return [opening, "", ...bullets.map((bullet) => `- ${bullet}`), "", closingSentence()].join("\n");
}

export function presentAnalystAnswer(input: {
  texts: string[];
  tables: CommentaryTable[];
  streaming: boolean;
}): { prose: string; tables: CommentaryTable[] } {
  const tables = input.streaming ? input.tables : selectAnalystTables(input.tables);
  const joined = input.texts.map((text) => text.trim()).filter(Boolean).join("\n\n");
  if (input.streaming || proseHasCommentaryShape(joined) || !tables.length) {
    return { prose: joined, tables };
  }
  const commentary = buildDatasetCommentary(tables[0]);
  return { prose: commentary ?? joined, tables };
}
