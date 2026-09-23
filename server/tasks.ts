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
  JevResolveTaskRpc,
  JevStatsRpc,
} from "../shared/rpc";
import type { JevSettingsValues } from "../shared/settings";
import { chosenKeyOf } from "../shared/contract";
import { taskOptions, type JevTask } from "../shared/task";
import { runBatchJudge, runJudge, type BatchTask, type JudgeResult } from "./judge";
import { makeLlmBackend } from "./backend";
import { buildQuestion, toCard, userCard } from "./card-map";
import { makeAsk, recentState } from "./model-ask";
import { aggregate, appendLog, readLog } from "./log";
import { addTask, getTask, readStore, removeTask, resolveTasks, updateTask } from "./store";

// ponytail: fixed fan-out chunk. Bounds one prompt so a huge batch can't overflow the model or
// fail all-or-nothing; make it token-aware if models vary a lot.
const BATCH_CHUNK = 12;

function modelFormatError(model: string): string | null {
  if (!model) return "No model. Pick one or set a default in Jev settings.";
  if (!model.includes("/")) return 'Model must be in "provider/model" format (e.g. anthropic/claude-sonnet-5).';
  return null;
}

function newId(): string {
  return `jev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
      id: `jev-${Date.now()}`,
      kind: JEV_DECISION_KIND,
      version: JEV_DECISION_VERSION,
      data: card,
    });
  } catch {
    // no card surface — the resolution is still persisted in the store
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
  logModel(task, result, model, shadow);
  await appendCard(context, task.agentId, card);
  if (shadow) return { ok: true, task }; // judged + logged, but left pending on purpose
  // guard: don't overwrite a user resolution that landed during the await
  const updated = updateTask(task.id, { status: "resolved", decidedBy: "model", model, result: card }, (t) => t.status === "pending");
  return { ok: true, task: updated ?? getTask(task.id) ?? task };
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

      const model = defaults.defaultModel;
      const modelErr = modelFormatError(model);
      if (modelErr) return { resolved: 0, note: modelErr };
      const valid = pending.filter((t) => buildQuestion(t.type, t.instructions, t.options));
      if (!valid.length) return { resolved: 0, note: "No valid pending tasks (choice/score need ≥2 options)." };

      const backend = makeLlmBackend(model, makeAsk(context, valid[0].cwd, model, input.agentId), defaults.samples);
      const batchTasks: BatchTask[] = valid.map((t) => ({
        id: t.id,
        question: buildQuestion(t.type, t.instructions, t.options)!,
      }));
      const state = await recentState(context, input.agentId);

      // Chunk the fan-out so a large batch can't overflow one prompt or fail all-or-nothing.
      const results: Record<string, JudgeResult> = {};
      for (let i = 0; i < batchTasks.length; i += BATCH_CHUNK) {
        const slice = batchTasks.slice(i, i + BATCH_CHUNK);
        try {
          Object.assign(
            results,
            await runBatchJudge({
              tasks: slice,
              state,
              model,
              strict: defaults.strict,
              threshold: defaults.threshold,
              reviewFloor: defaults.reviewFloor,
              backend,
            }),
          );
        } catch {
          // a failed chunk must not sink the others — skip it, keep going
        }
      }

      const shadow = defaults.shadow;
      const cards: Array<{ agentId: string; card: DecisionCard }> = [];
      const patches: Array<{ id: string; patch: Partial<JevTask> }> = [];
      let judged = 0;
      for (const t of valid) {
        const result = results[t.id];
        if (!result) continue;
        const card: DecisionCard = { ...toCard(result), shadow: shadow || undefined };
        logModel(t, result, model, shadow);
        cards.push({ agentId: t.agentId, card });
        if (!shadow) patches.push({ id: t.id, patch: { status: "resolved", decidedBy: "model", model, result: card } });
        judged++;
      }
      await Promise.all(cards.map((c) => appendCard(context, c.agentId, c.card)));
      if (!shadow) resolveTasks(patches); // one read+write for the whole batch; guards on pending
      return {
        resolved: shadow ? 0 : judged,
        note: shadow ? `shadow — judged ${judged}, left pending` : judged ? undefined : "No tasks judged (model error).",
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

export function statsHandler() {
  return async (input: RpcInput<typeof JevStatsRpc>): Promise<RpcOutput<typeof JevStatsRpc>> => {
    return aggregate(readLog(input.agentId));
  };
}
