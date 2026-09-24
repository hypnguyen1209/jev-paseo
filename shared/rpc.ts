// v0.2.0: wire contracts. Dotted names per repo convention. Zod-validated on both runtimes.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { JevTaskSchema } from "./task";
import { jevSettingsSchema } from "./settings";

const okTask = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), task: JevTaskSchema }),
  z.object({ ok: z.literal(false), note: z.string() }),
]);

export const JevModelsRpc = defineRpc({
  name: "jev.list-models",
  input: z.object({ cwd: z.string().optional() }),
  output: z.object({
    models: z.array(
      z.object({ id: z.string(), label: z.string(), provider: z.string(), isDefault: z.boolean() }),
    ),
    note: z.string().optional(),
  }),
});

export const JevListTasksRpc = defineRpc({
  name: "jev.list-tasks",
  input: z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    status: z.enum(["pending", "resolved"]).optional(),
  }),
  output: z.object({ tasks: z.array(JevTaskSchema) }),
});

export const JevAddTaskRpc = defineRpc({
  name: "jev.add-task",
  input: z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    cwd: z.string(),
    type: z.enum(["noul", "choice", "score"]),
    instructions: z.string(),
    description: z.string().optional(),
    options: z.array(z.string()).default([]),
    state: z.string().optional(),
    model: z.string().optional(),
    strict: z.boolean().optional(),
  }),
  output: okTask,
});

/** Edit a still-pending task in place (question, description, options, model, strict, evidence). */
export const JevUpdateTaskRpc = defineRpc({
  name: "jev.update-task",
  input: z.object({
    id: z.string(),
    type: z.enum(["noul", "choice", "score"]),
    instructions: z.string(),
    description: z.string().optional(),
    options: z.array(z.string()).default([]),
    state: z.string().optional(),
    model: z.string().optional(),
    strict: z.boolean().optional(),
  }),
  output: okTask,
});

/** Resolve a task with the LLM judge on a chosen (or the task's / default) model.
 *  `config` carries the effective settings (read client-side; 0.8.0 has no server settings read). */
export const JevJudgeTaskRpc = defineRpc({
  name: "jev.judge-task",
  input: z.object({ id: z.string(), model: z.string().optional(), config: jevSettingsSchema }),
  output: okTask,
});

/** Resolve a task manually — the user picks an option key. */
export const JevResolveTaskRpc = defineRpc({
  name: "jev.resolve-task",
  input: z.object({ id: z.string(), choiceKey: z.string() }),
  output: okTask,
});

export const JevRemoveTaskRpc = defineRpc({
  name: "jev.remove-task",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

/** Send a resolved task back to pending so it can be judged again (e.g. with a different model). */
export const JevReopenTaskRpc = defineRpc({
  name: "jev.reopen-task",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

/** Fan-out: resolve every pending task for the agent in ONE model call. */
export const JevJudgeAllRpc = defineRpc({
  name: "jev.judge-all",
  input: z.object({ workspaceId: z.string(), agentId: z.string(), config: jevSettingsSchema }),
  output: z.object({ resolved: z.number(), note: z.string().optional() }),
});

/** One decision-log record, for CSV export. Mirrors server/log.ts DecisionLog. */
export const DecisionLogRecordSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  type: z.enum(["noul", "choice", "score"]),
  instructions: z.string(),
  model: z.string(),
  decidedBy: z.enum(["user", "model"]),
  verdict: z.string(),
  band: z.enum(["high", "medium", "low"]).optional(),
  confidence: z.number(),
  chosen: z.string(),
  shadow: z.boolean(),
  createdAt: z.string(),
});
export type DecisionLogRecord = z.infer<typeof DecisionLogRecordSchema>;

/** The raw decision log for an agent, for exporting to CSV. */
export const JevExportRpc = defineRpc({
  name: "jev.export",
  input: z.object({ agentId: z.string() }),
  output: z.object({ records: z.array(DecisionLogRecordSchema) }),
});

/** Calibration stats from the decision log. */
export const JevStatsRpc = defineRpc({
  name: "jev.stats",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    total: z.number(),
    byModel: z.number(),
    byUser: z.number(),
    meanConfidence: z.number(),
    bands: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
    compared: z.number(),
    agreements: z.number(),
    agreementRate: z.number().nullable(),
    histogram: z.array(z.number()),
    recent: z.array(
      z.object({
        band: z.enum(["high", "medium", "low"]).nullable(),
        confidence: z.number(),
        decidedBy: z.enum(["user", "model"]),
      }),
    ),
  }),
});
