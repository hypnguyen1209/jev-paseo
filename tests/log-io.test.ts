import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLog, readLog, type DecisionLog } from "../server/log";

const dir = mkdtempSync(join(tmpdir(), "jev-log-"));
process.env.JEV_LOG_FILE = join(dir, "log.jsonl");

const rec = (o: Partial<DecisionLog>): DecisionLog => ({
  taskId: "t",
  agentId: "a",
  type: "noul",
  instructions: "q",
  model: "m",
  decidedBy: "model",
  verdict: "sufficient",
  band: "high",
  confidence: 0.9,
  chosen: "yes",
  shadow: false,
  createdAt: "2026-09-22",
  ...o,
});

describe("log append/read (temp file)", () => {
  it("missing file reads as empty", () => {
    expect(readLog()).toEqual([]);
  });
  it("appendLog then readLog round-trips", () => {
    appendLog(rec({ taskId: "l1" }));
    appendLog(rec({ taskId: "l2", agentId: "b" }));
    expect(readLog().length).toBe(2);
  });
  it("readLog(agentId) filters", () => {
    expect(readLog("a").every((r) => r.agentId === "a")).toBe(true);
    expect(readLog("b").length).toBe(1);
  });
  it("skips corrupt lines but keeps valid ones", () => {
    appendFileSync(process.env.JEV_LOG_FILE!, "not json\n", "utf8");
    appendLog(rec({ taskId: "l3" }));
    expect(readLog().some((r) => r.taskId === "l3")).toBe(true);
  });
  it("serves a new append from the warm cache (no missed records)", () => {
    readLog(); // warm the cache
    const before = readLog().length;
    appendLog(rec({ taskId: "warm" }));
    const after = readLog();
    expect(after.length).toBe(before + 1);
    expect(after.some((r) => r.taskId === "warm")).toBe(true);
  });
});
