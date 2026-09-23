// v0.4.0: append-only decision log + calibration stats (winnow/Canny "log every decision, measure
// regret" pattern). Every resolution — model or user, shadow or live — is logged. When a task was
// shadow-judged AND later resolved by the user, we can compare model-vs-user = the regret signal.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface DecisionLog {
  taskId: string;
  agentId: string;
  type: "noul" | "choice" | "score";
  instructions: string;
  model: string;
  decidedBy: "user" | "model";
  verdict: string;
  band?: "high" | "medium" | "low";
  confidence: number;
  chosen: string;
  shadow: boolean;
  createdAt: string;
}

export interface JevStats {
  total: number;
  byModel: number;
  byUser: number;
  /** mean confidence over MODEL decisions (user picks are always 1). */
  meanConfidence: number;
  bands: { high: number; medium: number; low: number };
  /** tasks that got both a model (shadow) judgment and a user resolution. */
  compared: number;
  agreements: number;
  agreementRate: number | null;
}

/** Pure: fold a list of decision records into calibration stats. */
export function aggregate(records: DecisionLog[]): JevStats {
  const model = records.filter((r) => r.decidedBy === "model");
  const bands = { high: 0, medium: 0, low: 0 };
  for (const r of model) if (r.band) bands[r.band]++;
  const meanConfidence = model.length
    ? model.reduce((s, r) => s + (Number.isFinite(r.confidence) ? r.confidence : 0), 0) / model.length
    : 0;

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
  };
}

function file(): string {
  return process.env.JEV_LOG_FILE || join(homedir(), ".paseo", "plugin-data", "jev-decisions.jsonl");
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
