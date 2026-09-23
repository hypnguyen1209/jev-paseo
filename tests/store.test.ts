import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addTask, getTask, readStore, removeTask, updateTask } from "../server/store";
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
});
