import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  addTaskHandler,
  judgeAllHandler,
  judgeTaskHandler,
  listTasksHandler,
  removeTaskHandler,
  reopenTaskHandler,
  resolveTaskHandler,
  statsHandler,
  updateTaskHandler,
} from "../server/tasks";
import { addTask, getTask } from "../server/store";
import { readLog } from "../server/log";
import { jevSettingsSchema, type JevSettingsValues } from "../shared/settings";
import type { JevTask } from "../shared/task";

const dir = mkdtempSync(join(tmpdir(), "jev-tasks-"));
process.env.JEV_TASKS_FILE = join(dir, "tasks.json");
process.env.JEV_LOG_FILE = join(dir, "log.jsonl");

const cfg = (o: Partial<JevSettingsValues> = {}): JevSettingsValues => jevSettingsSchema.parse({ defaultModel: "prov/x", ...o });

const mk = (id: string, agentId: string, over: Partial<JevTask> = {}): JevTask => ({
  id,
  workspaceId: "w",
  agentId,
  cwd: ".",
  type: "noul",
  instructions: "ready?",
  options: [],
  createdAt: new Date().toISOString(),
  status: "pending",
  ...over,
});

/**
 * Fake LLM context: agents.create reads the batch outputSchema's question ids and self-reports the
 * given distribution for each (mirrors a real self-report reply). Counts create() calls (fan-out).
 */
function fakeContext(probs: Record<string, number> = { no: 0.05, yes: 0.95 }): {
  context: PluginHandlerContext;
  creates: () => number;
} {
  let n = 0;
  const context = {
    paseo: {
      agents: {
        ref: () => ({ timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) } }),
        create: async (opts: { outputSchema?: { properties?: { answers?: { properties?: Record<string, unknown> } } } }) => {
          n++;
          const props = opts.outputSchema?.properties?.answers?.properties;
          const ids = props ? Object.keys(props) : ["main"];
          const answers: Record<string, unknown> = {};
          for (const id of ids) answers[id] = { probabilities: probs };
          return {
            waitForFinish: async () => ({ status: "idle", lastMessage: JSON.stringify({ answers }), final: null, error: null }),
            archive: async () => {},
          };
        },
      },
    },
  } as unknown as PluginHandlerContext;
  return { context, creates: () => n };
}

/** Context that records agent.send() calls, for the feedback loop. */
function fbContext(): { context: PluginHandlerContext; sent: string[] } {
  const sent: string[] = [];
  const context = {
    paseo: {
      agents: {
        ref: () => ({
          timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
          send: async (t: string) => {
            sent.push(t);
          },
        }),
        create: async () => ({
          waitForFinish: async () => ({
            status: "idle",
            lastMessage: JSON.stringify({ answers: { main: { probabilities: { no: 0.02, yes: 0.98 } } } }),
            final: null,
            error: null,
          }),
          archive: async () => {},
        }),
      },
    },
  } as unknown as PluginHandlerContext;
  return { context, sent };
}

describe("updateTaskHandler", () => {
  it("edits a pending task's fields", async () => {
    addTask(mk("U1", "upd", { instructions: "old?", type: "choice", options: ["a", "b"] }));
    const res = await updateTaskHandler()({ id: "U1", type: "choice", instructions: "new?", options: ["x", "y", "z"], model: "prov/m" });
    expect(res.ok).toBe(true);
    const t = getTask("U1");
    expect(t?.instructions).toBe("new?");
    expect(t?.options).toEqual(["x", "y", "z"]);
    expect(t?.model).toBe("prov/m");
  });
  it("won't edit a resolved task, and validates", async () => {
    addTask(mk("U2", "upd", { status: "resolved" }));
    expect((await updateTaskHandler()({ id: "U2", type: "noul", instructions: "x", options: [] })).ok).toBe(false);
    addTask(mk("U3", "upd"));
    expect((await updateTaskHandler()({ id: "U3", type: "noul", instructions: "   ", options: [] })).ok).toBe(false);
    expect((await updateTaskHandler()({ id: "U3", type: "choice", instructions: "pick", options: ["one"] })).ok).toBe(false);
  });
});

describe("reopenTaskHandler", () => {
  it("sends a resolved task back to pending and clears the result", async () => {
    addTask(mk("RO1", "ro", { status: "resolved", decidedBy: "user" }));
    expect((await reopenTaskHandler()({ id: "RO1" })).ok).toBe(true);
    expect(getTask("RO1")?.status).toBe("pending");
    expect(getTask("RO1")?.decidedBy).toBeUndefined();
    expect((await reopenTaskHandler()({ id: "ghost" })).ok).toBe(false);
  });
});

describe("agent feedback loop (JEV_FEEDBACK)", () => {
  it("feeds a marker task's verdict back to the agent when enabled", async () => {
    const { context, sent } = fbContext();
    process.env.JEV_FEEDBACK = "1";
    addTask(mk("FB1", "fb", { source: "marker" }));
    await judgeTaskHandler()({ id: "FB1", config: cfg() }, context);
    delete process.env.JEV_FEEDBACK;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("[jev] Decision on");
    expect(sent[0]).toContain("yes");
  });
  it("stays silent for a non-marker task, and when the flag is off", async () => {
    const off = fbContext();
    addTask(mk("FB2", "fb2", { source: "marker" }));
    await judgeTaskHandler()({ id: "FB2", config: cfg() }, off.context); // flag off
    expect(off.sent).toHaveLength(0);

    const nonMarker = fbContext();
    process.env.JEV_FEEDBACK = "1";
    addTask(mk("FB3", "fb3")); // no source
    await judgeTaskHandler()({ id: "FB3", config: cfg() }, nonMarker.context);
    delete process.env.JEV_FEEDBACK;
    expect(nonMarker.sent).toHaveLength(0);
  });
});

describe("addTaskHandler", () => {
  it("adds a valid task as pending", async () => {
    const res = await addTaskHandler()({ workspaceId: "w", agentId: "crud", cwd: ".", type: "noul", instructions: "ok?", options: [] });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(getTask(res.task.id)?.status).toBe("pending");
  });
  it("rejects an empty question", async () => {
    expect((await addTaskHandler()({ workspaceId: "w", agentId: "crud", cwd: ".", type: "noul", instructions: "   ", options: [] })).ok).toBe(false);
  });
  it("rejects choice with < 2 options", async () => {
    expect((await addTaskHandler()({ workspaceId: "w", agentId: "crud", cwd: ".", type: "choice", instructions: "pick", options: ["one"] })).ok).toBe(false);
  });
});

describe("listTasksHandler", () => {
  it("filters by agent + status and sorts newest-first", async () => {
    addTask(mk("L1", "list", { createdAt: "2026-09-22T00:00:01Z" }));
    addTask(mk("L2", "list", { createdAt: "2026-09-22T00:00:03Z", status: "resolved" }));
    addTask(mk("L3", "list", { createdAt: "2026-09-22T00:00:02Z" }));
    addTask(mk("X1", "other"));
    const all = await listTasksHandler()({ workspaceId: "w", agentId: "list" });
    expect(all.tasks.map((t) => t.id)).toEqual(["L2", "L3", "L1"]);
    const pending = await listTasksHandler()({ workspaceId: "w", agentId: "list", status: "pending" });
    expect(pending.tasks.map((t) => t.id)).toEqual(["L3", "L1"]);
  });
});

describe("resolveTaskHandler (user pick)", () => {
  it("valid key → resolved + user log", async () => {
    addTask(mk("R1", "res"));
    const res = await resolveTaskHandler()({ id: "R1", choiceKey: "yes" }, fakeContext().context);
    expect(res.ok).toBe(true);
    expect(getTask("R1")?.status).toBe("resolved");
    expect(getTask("R1")?.decidedBy).toBe("user");
    expect(readLog("res").some((r) => r.decidedBy === "user" && r.chosen === "yes")).toBe(true);
  });
  it("unknown option key → rejected, task stays pending", async () => {
    addTask(mk("R2", "res"));
    const res = await resolveTaskHandler()({ id: "R2", choiceKey: "maybe" }, fakeContext().context);
    expect(res.ok).toBe(false);
    expect(getTask("R2")?.status).toBe("pending");
  });
  it("not found → error", async () => {
    expect((await resolveTaskHandler()({ id: "ghost", choiceKey: "yes" }, fakeContext().context)).ok).toBe(false);
  });
});

describe("removeTaskHandler", () => {
  it("removes a task", async () => {
    addTask(mk("D1", "del"));
    await removeTaskHandler()({ id: "D1" });
    expect(getTask("D1")).toBeNull();
  });
});

describe("judgeTaskHandler", () => {
  it("task not found → error", async () => {
    expect((await judgeTaskHandler()({ id: "ghost", config: cfg() }, fakeContext().context)).ok).toBe(false);
  });
  it("no model available → error", async () => {
    addTask(mk("J0", "single"));
    const res = await judgeTaskHandler()({ id: "J0", config: cfg({ defaultModel: "" }) }, fakeContext().context);
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.note).toContain("No model");
  });
  it("bare model (no provider/) → error", async () => {
    addTask(mk("JF", "single"));
    const res = await judgeTaskHandler()({ id: "JF", config: cfg({ defaultModel: "opus" }) }, fakeContext().context);
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.note).toContain("provider/model");
  });
  it("LLM backend resolves the task (strict, confident)", async () => {
    addTask(mk("J1", "single"));
    const res = await judgeTaskHandler()({ id: "J1", config: cfg() }, fakeContext().context);
    expect(res.ok).toBe(true);
    expect(getTask("J1")?.status).toBe("resolved");
    expect(getTask("J1")?.decidedBy).toBe("model");
    expect(readLog("single").some((r) => r.taskId === "J1" && r.decidedBy === "model" && r.shadow === false)).toBe(true);
  });
  it("sub-threshold answer → insufficient but still resolved", async () => {
    addTask(mk("SUB", "sub"));
    const res = await judgeTaskHandler()({ id: "SUB", config: cfg() }, fakeContext({ no: 0.3, yes: 0.7 }).context);
    expect(res.ok).toBe(true);
    expect(getTask("SUB")?.status).toBe("resolved");
    expect(getTask("SUB")?.result?.verdict).toBe("insufficient");
    expect(getTask("SUB")?.result?.band).toBe("low");
  });
  it("shadow mode: judges + logs (shadow:true) but leaves PENDING", async () => {
    addTask(mk("t1", "a"));
    const res = await judgeTaskHandler()({ id: "t1", config: cfg({ shadow: true }) }, fakeContext().context);
    expect(res.ok).toBe(true);
    expect(getTask("t1")?.status).toBe("pending");
    expect(readLog("a").some((r) => r.decidedBy === "model" && r.shadow === true)).toBe(true);
  });
  it("model judge does NOT overwrite a user resolution (concurrency guard)", async () => {
    addTask(mk("G1", "guard"));
    await resolveTaskHandler()({ id: "G1", choiceKey: "yes" }, fakeContext().context);
    await judgeTaskHandler()({ id: "G1", config: cfg() }, fakeContext().context);
    expect(getTask("G1")?.status).toBe("resolved");
    expect(getTask("G1")?.decidedBy).toBe("user");
  });
  it("uses explicit task.state as evidence (recentState/refetch not consulted)", async () => {
    addTask(mk("ST1", "state", { state: "EXPLICIT EVIDENCE XYZ" }));
    let refetchCalled = false;
    let capturedPrompt = "";
    const ctx = {
      paseo: {
        agents: {
          ref: () => ({ timeline: { append: async () => {}, refetch: async () => { refetchCalled = true; return { entries: [] }; } } }),
          create: async (opts: { prompt?: string }) => {
            capturedPrompt = opts.prompt ?? "";
            return { waitForFinish: async () => ({ status: "idle", lastMessage: '{"answers":{"main":{"probabilities":{"no":0.1,"yes":0.9}}}}', final: null, error: null }), archive: async () => {} };
          },
        },
      },
    } as unknown as PluginHandlerContext;
    await judgeTaskHandler()({ id: "ST1", config: cfg() }, ctx);
    expect(capturedPrompt).toContain("EXPLICIT EVIDENCE XYZ");
    expect(refetchCalled).toBe(false);
  });
});

describe("task description", () => {
  it("round-trips and folds into the judge's evidence", async () => {
    addTask(mk("DSC", "desc", { description: "This gates a prod deploy.", state: "run log attached" }));
    let capturedPrompt = "";
    const ctx = {
      paseo: {
        agents: {
          ref: () => ({ timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) } }),
          create: async (opts: { prompt?: string }) => {
            capturedPrompt = opts.prompt ?? "";
            return {
              waitForFinish: async () => ({ status: "idle", lastMessage: '{"answers":{"main":{"probabilities":{"no":0.1,"yes":0.9}}}}', final: null, error: null }),
              archive: async () => {},
            };
          },
        },
      },
    } as unknown as PluginHandlerContext;
    await judgeTaskHandler()({ id: "DSC", config: cfg() }, ctx);
    expect(getTask("DSC")?.description).toBe("This gates a prod deploy.");
    expect(capturedPrompt).toContain("Context: This gates a prod deploy.");
    expect(capturedPrompt).toContain("run log attached");
  });
});

describe("judgeAllHandler (fan-out)", () => {
  it("resolves ALL pending in ONE backend call", async () => {
    for (const id of ["B1", "B2", "B3"]) addTask(mk(id, "batch"));
    const fc = fakeContext();
    const res = await judgeAllHandler()({ workspaceId: "w", agentId: "batch", config: cfg() }, fc.context);
    expect(fc.creates()).toBe(1); // fan-out: one model call for all
    expect(res.resolved).toBe(3);
    for (const id of ["B1", "B2", "B3"]) expect(getTask(id)?.status).toBe("resolved");
  });
  it("skips invalid tasks and resolves the valid ones (no throw)", async () => {
    addTask(mk("V1", "mix"));
    addTask(mk("V2", "mix"));
    addTask(mk("BAD", "mix", { type: "choice", options: ["only"] }));
    const res = await judgeAllHandler()({ workspaceId: "w", agentId: "mix", config: cfg() }, fakeContext().context);
    expect(res.resolved).toBe(2);
    expect(getTask("V1")?.status).toBe("resolved");
    expect(getTask("BAD")?.status).toBe("pending");
  });
  it("shadow: leaves all pending, resolved 0 + note", async () => {
    for (const id of ["S1", "S2"]) addTask(mk(id, "batchS"));
    const res = await judgeAllHandler()({ workspaceId: "w", agentId: "batchS", config: cfg({ shadow: true }) }, fakeContext().context);
    expect(res.resolved).toBe(0);
    expect(res.note).toContain("shadow");
    for (const id of ["S1", "S2"]) expect(getTask(id)?.status).toBe("pending");
  });
  it("no pending → note", async () => {
    const res = await judgeAllHandler()({ workspaceId: "w", agentId: "empty", config: cfg() }, fakeContext().context);
    expect(res.resolved).toBe(0);
    expect(res.note).toContain("No pending");
  });
});

describe("statsHandler", () => {
  it("returns aggregate stats for the agent's decision log", async () => {
    const s = await statsHandler()({ agentId: "single" });
    expect(s.total).toBeGreaterThan(0);
    expect(s.byModel).toBeGreaterThan(0);
    expect(typeof s.meanConfidence).toBe("number");
  });
});
