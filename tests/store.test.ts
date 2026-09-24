import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addTask, getTask, readStore, removeTask, resolveTasks, updateTask, writeStore } from "../server/store";
import type { JevTask } from "../shared/task";

const dir = mkdtempSync(join(tmpdir(), "jev-store-"));
process.env.JEV_TASKS_FILE = join(dir, "tasks.json");

const t = (id: string): JevTask => ({
  id,
  workspaceId: "w",
  agentId: "a",
  cwd: ".",
  type: "noul",
  instructions: "q",
  options: [],
  createdAt: "2026-09-22",
  status: "pending",
});

describe("store CRUD (temp file)", () => {
  it("missing file reads as empty", () => {
    expect(readStore()).toEqual([]);
  });
  it("addTask + getTask", () => {
    addTask(t("s1"));
    expect(getTask("s1")?.id).toBe("s1");
    expect(getTask("nope")).toBeNull();
  });
  it("updateTask patches and returns; unknown id → null", () => {
    addTask(t("s2"));
    const u = updateTask("s2", { status: "resolved" });
    expect(u?.status).toBe("resolved");
    expect(getTask("s2")?.status).toBe("resolved");
    expect(updateTask("ghost", { status: "resolved" })).toBeNull();
  });
  it("removeTask deletes", () => {
    addTask(t("s3"));
    removeTask("s3");
    expect(getTask("s3")).toBeNull();
  });
  it("updateTask guard skips the write when current state fails the guard", () => {
    addTask(t("s4"));
    updateTask("s4", { status: "resolved" }); // now resolved
    const r = updateTask("s4", { decidedBy: "model" }, (x) => x.status === "pending");
    expect(r).toBeNull(); // guard fails → no overwrite
    expect(getTask("s4")?.decidedBy).toBeUndefined();
  });
  it("corrupt file reads as empty (never throws)", () => {
    writeFileSync(process.env.JEV_TASKS_FILE!, "{ not json", "utf8");
    expect(readStore()).toEqual([]);
  });
  it("drops a malformed task but keeps the valid ones", () => {
    writeFileSync(
      process.env.JEV_TASKS_FILE!,
      JSON.stringify({ v: 1, tasks: [t("good"), { id: "bad", nope: true }] }),
      "utf8",
    );
    expect(readStore().map((x) => x.id)).toEqual(["good"]);
  });
  it("resolveTasks patches only pending tasks and returns the applied ids", () => {
    writeStore([
      { ...t("r1"), status: "pending" },
      { ...t("r2"), status: "resolved" }, // already resolved → guard skips
    ]);
    const applied = resolveTasks([
      { id: "r1", patch: { status: "resolved", decidedBy: "model" } },
      { id: "r2", patch: { status: "resolved", decidedBy: "model" } },
    ]);
    expect(applied).toEqual(["r1"]);
    expect(getTask("r1")?.decidedBy).toBe("model");
  });
  it("prunes resolved tasks beyond the cap but keeps every pending one", () => {
    const resolved = Array.from({ length: 260 }, (_, i) => ({
      ...t(`old-${i}`),
      status: "resolved" as const,
      createdAt: `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`,
    }));
    writeStore([...resolved, { ...t("keep-pending"), status: "pending" }]);
    const after = readStore();
    expect(after.filter((x) => x.status === "resolved").length).toBe(200);
    expect(getTask("keep-pending")?.status).toBe("pending"); // pending never pruned
  });
});
