// v0.6.0: pure decision-log -> CSV. No React/RN imports, so it is unit-testable in node.
import type { DecisionLogRecord } from "../shared/rpc";

const COLUMNS = [
  "createdAt",
  "decidedBy",
  "type",
  "verdict",
  "band",
  "confidence",
  "chosen",
  "model",
  "instructions",
  "shadow",
  "taskId",
] as const;

/** RFC 4180 cell: quote when it contains a comma, quote, or newline; double any inner quote. */
function cell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records: DecisionLogRecord[]): string {
  const rows = records.map((r) => COLUMNS.map((c) => cell((r as Record<string, unknown>)[c])).join(","));
  return [COLUMNS.join(","), ...rows].join("\r\n");
}
