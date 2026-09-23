// v0.3.0: judge-task handlers. add-task queues a pending decision; judge-task resolves one with the
// multi-round STRICT judge; judge-all resolves EVERY pending task in one fan-out backend call;
// resolve-task resolves one manually. Backend is the real jev API or any LLM. Never throws.
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { JEV_DECISION_KIND, JEV_DECISION_VERSION, type DecisionCard } from "../shared/card";
import {
  JevAddTaskRpc,
  JevJudgeAllRpc,
  JevJudgeTaskRpc,
  JevListTasksRpc,
  JevRemoveTaskRpc,
  JevReopenTaskRpc,
  JevResolveTaskRpc,
  JevStatsRpc,
  JevUpdateTaskRpc,
} from "../shared/rpc";
import type { JevSettingsValues } from "../shared/settings";
import { chosenKeyOf } from "../shared/contract";
import { taskOptions, type JevTask } from "../shared/task";
import { runBatchJudge, runJudge, type BatchTask, type JudgeResult } from "./judge";
import { makeLlmBackend } from "./backend";
import { buildQuestion, toCard, userCard } from "./card-map";
import { makeAsk, recentState } from "./model-ask";
import { aggregate, appendLog, readLog } from "./log";
import { addTask, getTask, newId, readStore, removeTask, resolveTasks, updateTask } from "./store";

// ponytail: fixed fan-out chunk. Bounds one prompt so a huge batch can't overflow the model or
// fail all-or-nothing; make it token-aware if models vary a lot.
const BATCH_CHUNK = 12;

function modelFormatError(model: string): string | null {
  if (!model) return "No model. Pick one or set a default in Jev settings.";
  if (!model.includes("/")) return 'Model must be in "provider/model" format (e.g. anthropic/claude-sonnet-5).';
  return null;
}

function logModel(task: JevTask, result: JudgeResult, model: string, shadow: boolean): void {
  appendLog({
    taskId: task.id,
    agentId: task.agentId,
    type: result.type,
    instructions: result.instructions,
    model,
    decidedBy: "model",
    verdict: result.verdict,
    band: result.band,
    confidence: result.confidence,
    chosen: chosenKeyOf(result.decision),
    shadow,
    createdAt: new Date().toISOString(),
  });
}

async function appendCard(context: PluginHandlerContext, agentId: string, card: DecisionCard): Promise<void> {
  try {
    await context.paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: newId(),
      kind: JEV_DECISION_KIND,
      version: JEV_DECISION_VERSION,
      data: card,
    });
  } catch {
    // no card surface — the resolution is still persisted in the store
  }
}

const fpct = (n: number): string => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

/**
 * Close the agent → plugin → agent loop: when a task the agent pushed via a [jev] marker resolves,
 * feed the decision back into its session so the coding agent can act on it. Opt-in (JEV_FEEDBACK=1),
 * marker-only, best-effort — a send failure never affects the resolution.
 */
async function sendFeedback(context: PluginHandlerContext, task: JevTask, card: DecisionCard): Promise<void> {
  if (process.env.JEV_FEEDBACK !== "1" || task.source !== "marker") return;
  const who = card.decidedBy === "user" ? "you" : card.model || "a model";
  const line = `[jev] Decision on "${task.instructions}": ${card.answerLabel} — ${card.band ?? "?"} confidence (${fpct(
    card.confidence,
  )}), decided by ${who}.`;
  try {
    await context.paseo.agents.ref(task.agentId).send(line);
  } catch {
    // best-effort: the session may be busy or gone; the store + card still hold the decision
  }
}

export function listTasksHandler() {
  return async (input: RpcInput<typeof JevListTasksRpc>): Promise<RpcOutput<typeof JevListTasksRpc>> => {
    const tasks = readStore()
      .filter((t) => t.agentId === input.agentId && (!input.status || t.status === input.status))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return { tasks };
  };
}

export function addTaskHandler() {
  return async (input: RpcInput<typeof JevAddTaskRpc>): Promise<RpcOutput<typeof JevAddTaskRpc>> => {
    if (!input.instructions.trim()) return { ok: false, note: "Enter a question." };
    if (input.type !== "noul" && input.options.length < 2) {
      return { ok: false, note: "choice/score need at least 2 options." };
    }
    const task: JevTask = {
      id: newId(),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      cwd: input.cwd,
      type: input.type,
      instructions: input.instructions.trim(),
      options: input.options,
      state: input.state?.trim() || undefined,
      model: input.model?.trim() || undefined,
      strict: input.strict,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    addTask(task);
    return { ok: true, task };
  };
}

export function updateTaskHandler() {
  return async (input: RpcInput<typeof JevUpdateTaskRpc>): Promise<RpcOutput<typeof JevUpdateTaskRpc>> => {
    if (!input.instructions.trim()) return { ok: false, note: "Enter a question." };
    if (input.type !== "noul" && input.options.length < 2) {
      return { ok: false, note: "choice/score need at least 2 options." };
    }
    const patch: Partial<JevTask> = {
      type: input.type,
      instructions: input.instructions.trim(),
      options: input.options,
      state: input.state?.trim() || undefined,
      model: input.model?.trim() || undefined,
      strict: input.strict,
    };
    // guard: only edit a task that's still pending — never rewrite a resolved decision
    const updated = updateTask(input.id, patch, (t) => t.status === "pending");
    return updated ? { ok: true, task: updated } : { ok: false, note: "task not found or already resolved." };
  };
}

/** The judge core — reused by the RPC handler and the agent-marker hook. May throw; callers catch. */
export async function judgeTask(
  task: JevTask,
  defaults: JevSettingsValues,
  context: PluginHandlerContext,
  inputModel?: string,
): Promise<RpcOutput<typeof JevJudgeTaskRpc>> {
  const model = (inputModel ?? "").trim() || task.model || defaults.defaultModel;
  const modelErr = modelFormatError(model);
  if (modelErr) return { ok: false, note: modelErr };
  const question = buildQuestion(task.type, task.instructions, task.options);
  if (!question) return { ok: false, note: "choice/score need at least 2 options." };

  const strict = task.strict ?? defaults.strict;
  const state = (task.state ?? "").trim() || (await recentState(context, task.agentId));
  const backend = makeLlmBackend(model, makeAsk(context, task.cwd, model, task.agentId), defaults.samples);
  const result = await runJudge({
    question,
    state,
    model,
    strict,
    threshold: defaults.threshold,
    reviewFloor: defaults.reviewFloor,
    maxRounds: defaults.maxRounds,
    backend,
  });
  const shadow = defaults.shadow;
  const card: DecisionCard = { ...toCard(result), shadow: shadow || undefined };
  if (shadow) {
    // shadow: judge + log + card, but leave the task pending on purpose
    logModel(task, result, model, true);
    await appendCard(context, task.agentId, card);
    return { ok: true, task };
  }
  // guard: don't overwrite a user resolution that landed during the await. Only log + card the
  // decision if it actually resolved the task — a lost race must not leave a phantom model card/log.
  const updated = updateTask(task.id, { status: "resolved", decidedBy: "model", model, result: card }, (t) => t.status === "pending");
  if (!updated) return { ok: true, task: getTask(task.id) ?? task };
  logModel(task, result, model, false);
  await appendCard(context, task.agentId, card);
  await sendFeedback(context, task, card);
  return { ok: true, task: updated };
}

export function judgeTaskHandler() {
  return async (
    input: RpcInput<typeof JevJudgeTaskRpc>,
    context: PluginHandlerContext,
  ): Promise<RpcOutput<typeof JevJudgeTaskRpc>> => {
    try {
      const task = getTask(input.id);
      if (!task) return { ok: false, note: "task not found." };
      return await judgeTask(task, input.config, context, input.model);
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  };
}

export function judgeAllHandler() {
  return async (
    input: RpcInput<typeof JevJudgeAllRpc>,
    context: PluginHandlerContext,
  ): Promise<RpcOutput<typeof JevJudgeAllRpc>> => {
    try {
      const defaults: JevSettingsValues = input.config;
      const pending = readStore().filter((t) => t.agentId === input.agentId && t.status === "pending");
      if (!pending.length) return { resolved: 0, note: "No pending judge tasks." };

      const valid = pending.filter((t) => buildQuestion(t.type, t.instructions, t.options));
      if (!valid.length) return { resolved: 0, note: "No valid pending tasks (choice/score need ≥2 options)." };

      const state = await recentState(context, input.agentId);
      const effModel = (t: JevTask) => t.model?.trim() || defaults.defaultModel;

      // Group by effective model so a task's preferred model is honored; tasks sharing a model still
      // resolve in one call. Chunk each group so a large batch can't overflow one prompt.
      const groups = new Map<string, JevTask[]>();
      for (const t of valid) {
        const g = groups.get(effModel(t));
        if (g) g.push(t);
        else groups.set(effModel(t), [t]);
      }

      const results: Record<string, JudgeResult> = {};
      let lastErr: unknown;
      for (const [model, tasks] of groups) {
        const modelErr = modelFormatError(model);
        if (modelErr) {
          lastErr = new Error(modelErr);
          continue;
        }
        const backend = makeLlmBackend(model, makeAsk(context, tasks[0].cwd, model, input.agentId), defaults.samples);
        const batchTasks: BatchTask[] = tasks.map((t) => ({
          id: t.id,
          question: buildQuestion(t.type, t.instructions, t.options)!,
        }));
        for (let i = 0; i < batchTasks.length; i += BATCH_CHUNK) {
          try {
            Object.assign(
              results,
              await runBatchJudge({
                tasks: batchTasks.slice(i, i + BATCH_CHUNK),
                state,
                model,
                strict: defaults.strict,
                threshold: defaults.threshold,
                reviewFloor: defaults.reviewFloor,
                backend,
              }),
            );
          } catch (e) {
            lastErr = e; // a failed chunk must not sink the others — remember it, keep going
          }
        }
      }

      const shadow = defaults.shadow;
      const judgedList = valid
        .map((t) => ({ task: t, result: results[t.id] }))
        .filter((x): x is { task: JevTask; result: JudgeResult } => Boolean(x.result))
        .map(({ task, result }) => ({
          task,
          result,
          model: effModel(task),
          card: { ...toCard(result), shadow: shadow || undefined } as DecisionCard,
        }));

      if (shadow) {
        for (const j of judgedList) logModel(j.task, j.result, j.model, true);
        await Promise.all(judgedList.map((j) => appendCard(context, j.task.agentId, j.card)));
        return { resolved: 0, note: `shadow — judged ${judgedList.length}, left pending` };
      }

      // Resolve first (one read+write, guarded on pending); then log + card only the decisions that
      // actually landed, so a user pick during the await doesn't leave a phantom model card/log.
      const applied = new Set(
        resolveTasks(
          judgedList.map((j) => ({
            id: j.task.id,
            patch: { status: "resolved", decidedBy: "model", model: j.model, result: j.card },
          })),
        ),
      );
      const done = judgedList.filter((j) => applied.has(j.task.id));
      for (const j of done) logModel(j.task, j.result, j.model, false);
      await Promise.all(done.map((j) => appendCard(context, j.task.agentId, j.card)));
      await Promise.all(done.map((j) => sendFeedback(context, j.task, j.card)));
      return {
        resolved: done.length,
        note: done.length ? undefined : `No tasks judged: ${lastErr instanceof Error ? lastErr.message : "model error"}`,
      };
    } catch (e) {
      return { resolved: 0, note: e instanceof Error ? e.message : String(e) };
    }
  };
}

export function resolveTaskHandler() {
  return async (
    input: RpcInput<typeof JevResolveTaskRpc>,
    context: PluginHandlerContext,
  ): Promise<RpcOutput<typeof JevResolveTaskRpc>> => {
    try {
      const task = getTask(input.id);
      if (!task) return { ok: false, note: "task not found." };
      if (!taskOptions(task).some((o) => o.key === input.choiceKey)) {
        return { ok: false, note: `unknown option "${input.choiceKey}" for this task.` };
      }
      const card = userCard(task.type, task.instructions, task.options, input.choiceKey);
      const updated = updateTask(task.id, { status: "resolved", decidedBy: "user", result: card });
      appendLog({
        taskId: task.id,
        agentId: task.agentId,
        type: task.type,
        instructions: task.instructions,
        model: "",
        decidedBy: "user",
        verdict: "decided",
        band: "high",
        confidence: 1,
        chosen: input.choiceKey,
        shadow: false,
        createdAt: new Date().toISOString(),
      });
      await appendCard(context, task.agentId, card);
      await sendFeedback(context, task, card);
      return { ok: true, task: updated ?? task };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  };
}

export function removeTaskHandler() {
  return async (input: RpcInput<typeof JevRemoveTaskRpc>): Promise<RpcOutput<typeof JevRemoveTaskRpc>> => {
    removeTask(input.id);
    return { ok: true };
  };
}

export function reopenTaskHandler() {
  return async (input: RpcInput<typeof JevReopenTaskRpc>): Promise<RpcOutput<typeof JevReopenTaskRpc>> => {
    const t = updateTask(input.id, { status: "pending", decidedBy: undefined, result: undefined });
    return { ok: Boolean(t) };
  };
}

export function statsHandler() {
  return async (input: RpcInput<typeof JevStatsRpc>): Promise<RpcOutput<typeof JevStatsRpc>> => {
    return aggregate(readLog(input.agentId));
  };
}
