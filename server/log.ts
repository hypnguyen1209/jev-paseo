// v0.4.0: append-only decision log + calibration stats (winnow/Canny "log every decision, measure
// regret" pattern). Every resolution — model or user, shadow or live — is logged. When a task was
// shadow-judged AND later resolved by the user, we can compare model-vs-user = the regret signal.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { DecisionLogRecord } from "../shared/rpc";
import { pluginData } from "./paseo-home";

/** One decision record. The shared RPC schema is the single source of truth for the shape. */
export type DecisionLog = DecisionLogRecord;

interface RecentDecision {
  band: "high" | "medium" | "low" | null;
  confidence: number;
  decidedBy: "user" | "model";
}

interface JevStats {
  total: number;
  byModel: number;
  byUser: number;
  /** mean confidence over MODEL decisions (user picks are always 1). */
  meanConfidence: number;
  bands: { high: number; medium: number; low: number };
  /** tasks with both a model record and a user record (shadow-judge, or a re-judge after your pick). */
  compared: number;
  agreements: number;
  agreementRate: number | null;
  /** 5 buckets of MODEL confidence: [0-20), [20-40), [40-60), [60-80), [80-100]. */
  histogram: number[];
  /** the newest decisions (chronological), for a trend strip. */
  recent: RecentDecision[];
}

/** Pure: fold a list of decision records into calibration stats. */
export function aggregate(records: DecisionLog[]): JevStats {
  const model = records.filter((r) => r.decidedBy === "model");
  const bands = { high: 0, medium: 0, low: 0 };
  const histogram = [0, 0, 0, 0, 0];
  for (const r of model) {
    if (r.band) bands[r.band]++;
    const conf = Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
    histogram[Math.min(4, Math.floor(conf * 5))]++;
  }
  const meanConfidence = model.length
    ? model.reduce((s, r) => s + (Number.isFinite(r.confidence) ? r.confidence : 0), 0) / model.length
    : 0;
  const recent: RecentDecision[] = records
    .slice(-12)
    .map((r) => ({ band: r.band ?? null, confidence: Number.isFinite(r.confidence) ? r.confidence : 0, decidedBy: r.decidedBy }));

  // regret: latest model choice vs latest user choice, per task
  const latestModel = new Map<string, string>();
  const latestUser = new Map<string, string>();
  for (const r of records) {
    if (r.decidedBy === "model") latestModel.set(r.taskId, r.chosen);
    else latestUser.set(r.taskId, r.chosen);
  }
  let compared = 0;
  let agreements = 0;
  for (const [taskId, mChosen] of latestModel) {
    const uChosen = latestUser.get(taskId);
    if (uChosen === undefined) continue;
    compared++;
    if (uChosen === mChosen) agreements++;
  }

  return {
    total: records.length,
    byModel: model.length,
    byUser: records.length - model.length,
    meanConfidence,
    bands,
    compared,
    agreements,
    agreementRate: compared ? agreements / compared : null,
    histogram,
    recent,
  };
}

function file(): string {
  return process.env.JEV_LOG_FILE || pluginData("jev-decisions.jsonl");
}

// The parsed log, kept warm so stats don't re-parse the whole growing jsonl every call. Guarded by
// file size: an external write (size mismatch) rebuilds; our own appendLog pushes in place.
let logCache: { path: string; size: number; records: DecisionLog[] } | null = null;

function loadAll(f: string): DecisionLog[] {
  const out: DecisionLog[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as DecisionLog);
    } catch {
      // skip a corrupt line
    }
  }
  return out;
}

export function appendLog(rec: DecisionLog): void {
  try {
    const f = file();
    mkdirSync(dirname(f), { recursive: true });
    appendFileSync(f, `${JSON.stringify(rec)}\n`, "utf8");
    if (logCache && logCache.path === f) {
      logCache.records.push(rec);
      logCache.size = statSync(f).size; // stay in sync so readLog serves the warm cache
    }
  } catch {
    // logging is best-effort; never break a resolution over it
  }
}

// ponytail: the jsonl still grows unbounded on disk (one line per decision); rotate/tail it if that
// ever matters. This only caches the fold so stats stop re-parsing the whole file each call.
export function readLog(agentId?: string): DecisionLog[] {
  const f = file();
  try {
    const size = statSync(f).size;
    if (!logCache || logCache.path !== f || logCache.size !== size) {
      logCache = { path: f, size, records: loadAll(f) };
    }
    return agentId ? logCache.records.filter((r) => r.agentId === agentId) : logCache.records.slice();
  } catch {
    logCache = null; // missing/unreadable → don't serve a stale fold
    return [];
  }
}
