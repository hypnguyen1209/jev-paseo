// v0.2.0: durable judge-task store. Atomic write (temp + rename) per repo convention. Best-effort:
// a corrupt/missing file reads as empty rather than throwing. Override the path with JEV_TASKS_FILE.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { JevTaskSchema, type JevTask } from "../shared/task";

const StoreSchema = z.object({ v: z.literal(1), tasks: z.array(JevTaskSchema) });

function file(): string {
  return process.env.JEV_TASKS_FILE || join(homedir(), ".paseo", "plugin-data", "jev-tasks.json");
}

export function readStore(): JevTask[] {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(readFileSync(file(), "utf8")));
    return parsed.success ? parsed.data.tasks : [];
  } catch {
    return [];
  }
}

export function writeStore(tasks: JevTask[]): void {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify({ v: 1, tasks }, null, 2), "utf8");
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
 */
export function resolveTasks(updates: Array<{ id: string; patch: Partial<JevTask> }>): void {
  if (!updates.length) return;
  const patchById = new Map(updates.map((u) => [u.id, u.patch]));
  const tasks = readStore();
  for (const t of tasks) {
    const patch = patchById.get(t.id);
    if (patch && t.status === "pending") Object.assign(t, patch);
  }
  writeStore(tasks);
}
