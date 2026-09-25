// v0.2.0: durable judge-task store. Atomic write (temp + rename) per repo convention. Best-effort:
// a corrupt/missing file reads as empty rather than throwing. Override the path with JEV_TASKS_FILE.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { JevTaskSchema, type JevTask } from "../shared/task";
import { pluginData } from "./paseo-home";

// ponytail: cap resolved history kept in the live store (pending is always kept). Full history for
// stats lives in the append-only decision log, so the store only needs the recent resolved tail.
const MAX_RESOLVED = 200;

/** A collision-resistant task/entry id. Shared by the add handlers, the marker hook, and cards. */
export function newId(): string {
  return `jev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function file(): string {
  return process.env.JEV_TASKS_FILE || pluginData("jev-tasks.json");
}

/** Keep every pending task and only the newest MAX_RESOLVED resolved ones, bounding file growth. */
function prune(tasks: JevTask[]): JevTask[] {
  const resolved = tasks.filter((t) => t.status === "resolved");
  if (resolved.length <= MAX_RESOLVED) return tasks;
  const keep = new Set(
    resolved
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, MAX_RESOLVED)
      .map((t) => t.id),
  );
  return tasks.filter((t) => t.status !== "resolved" || keep.has(t.id));
}

export function readStore(): JevTask[] {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as { tasks?: unknown };
    if (!raw || !Array.isArray(raw.tasks)) return [];
    // Parse per task, dropping only the bad ones — one malformed entry must not void the whole store.
    const out: JevTask[] = [];
    for (const t of raw.tasks) {
      const parsed = JevTaskSchema.safeParse(t);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch {
    return [];
  }
}

export function writeStore(tasks: JevTask[]): void {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify({ v: 1, tasks: prune(tasks) }, null, 2), "utf8");
  renameSync(tmp, f);
}

export function getTask(id: string): JevTask | null {
  return readStore().find((t) => t.id === id) ?? null;
}

export function addTask(task: JevTask): void {
  const tasks = readStore();
  tasks.push(task);
  writeStore(tasks);
}

/**
 * Read-modify-write is atomic here (all fs ops are synchronous, single-threaded). `guard` runs
 * inside that atomic window: a model resolve that awaited a slow judge passes `t.status==="pending"`
 * so it can't clobber a user decision made during the await. User resolves stay unguarded → win.
 */
export function updateTask(
  id: string,
  patch: Partial<JevTask>,
  guard?: (current: JevTask) => boolean,
): JevTask | null {
  const tasks = readStore();
  const i = tasks.findIndex((t) => t.id === id);
  if (i < 0) return null;
  if (guard && !guard(tasks[i])) return null; // state changed under us → skip
  tasks[i] = { ...tasks[i], ...patch };
  writeStore(tasks);
  return tasks[i];
}

export function removeTask(id: string): void {
  writeStore(readStore().filter((t) => t.id !== id));
}

/**
 * Resolve many tasks in ONE read+write (keeps fan-out judging to a single persist). Only pending
 * tasks are patched — the same guard as updateTask, so a user resolution during a slow batch wins.
 * Returns the ids actually patched, so callers can log/card only the decisions that really landed.
 */
export function resolveTasks(updates: Array<{ id: string; patch: Partial<JevTask> }>): string[] {
  if (!updates.length) return [];
  const patchById = new Map(updates.map((u) => [u.id, u.patch]));
  const tasks = readStore();
  const applied: string[] = [];
  for (const t of tasks) {
    const patch = patchById.get(t.id);
    if (patch && t.status === "pending") {
      Object.assign(t, patch);
      applied.push(t.id);
    }
  }
  writeStore(tasks);
  return applied;
}
