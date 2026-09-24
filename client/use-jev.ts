// v0.6.0: shared client data hooks, backed by @tanstack/react-query. The Paseo runtime wraps every
// plugin tree in a QueryClientProvider (a per-plugin QueryClient), so useQuery/useMutation work
// directly. Reads are queries keyed by agent; writes are mutations that invalidate those queries.
import { useMemo } from "react";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jevSettings, jevSettingsSchema } from "../shared/settings";
import {
  JevAddTaskRpc,
  JevJudgeAllRpc,
  JevJudgeTaskRpc,
  JevListTasksRpc,
  JevModelsRpc,
  JevRemoveTaskRpc,
  JevReopenTaskRpc,
  JevResolveTaskRpc,
  JevStatsRpc,
  JevUpdateTaskRpc,
} from "../shared/rpc";
import type { JevTask } from "../shared/task";

export type JevStats = {
  total: number;
  byModel: number;
  byUser: number;
  meanConfidence: number;
  bands: { high: number; medium: number; low: number };
  compared: number;
  agreements: number;
  agreementRate: number | null;
  histogram: number[];
  recent: Array<{ band: "high" | "medium" | "low" | null; confidence: number; decidedBy: "user" | "model" }>;
};

export interface JevModel {
  id: string;
  label: string;
  /** The provider (agent harness) that serves this model: claude, codex, pi, minimax, etc. */
  provider: string;
  /** The provider's own default model — used to seed a pick when no default is configured. */
  isDefault: boolean;
}

/** Show just the model half of `provider/model` so labels don't overflow. */
export const shortModel = (id: string) => (id.includes("/") ? id.slice(id.indexOf("/") + 1) : id);

const errMsg = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

export function useJevModels(cwd?: string): { models: JevModel[]; note: string | null } {
  const listModels = useRpc(JevModelsRpc);
  const query = useQuery({
    // Keyed by cwd; react-query dedupes the queue + add-form + settings fetches into one call.
    queryKey: ["jev", "models", cwd ?? ""] as const,
    queryFn: () => listModels(cwd ? { cwd } : {}),
    staleTime: 5 * 60_000, // provider models rarely change
  });
  const models = useMemo(
    () => (query.data?.models ?? []).map((m) => ({ id: m.id, label: shortModel(m.id), provider: m.provider, isDefault: m.isDefault })),
    [query.data],
  );
  const note = query.data?.note ?? (query.error ? errMsg(query.error) : null);
  return { models, note };
}

export interface AddTaskInput {
  type: "noul" | "choice" | "score";
  instructions: string;
  options: string[];
  state?: string;
  model?: string;
  strict?: boolean;
}

type Result = { ok: boolean; note?: string };

export interface UseJevTasks {
  tasks: JevTask[];
  pending: JevTask[];
  resolved: JevTask[];
  stats: JevStats | null;
  busyId: string | null;
  busyAll: boolean;
  refresh: () => Promise<void>;
  add: (input: AddTaskInput) => Promise<Result>;
  update: (id: string, input: AddTaskInput) => Promise<Result>;
  judge: (id: string, model?: string) => Promise<Result>;
  judgeAll: () => Promise<{ resolved: number; note?: string }>;
  rejudge: (id: string, model?: string) => Promise<Result>;
  resolve: (id: string, choiceKey: string) => Promise<Result>;
  remove: (id: string) => Promise<void>;
}

/** The task id a per-row write is in flight for (drives the row spinner + disables). */
function pendingId(m: { isPending: boolean; variables: unknown }): string | null {
  if (!m.isPending) return null;
  const v = m.variables;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "string") return (v as { id: string }).id;
  return null;
}

export function useJevTasks(workspaceId: string, agentId: string, cwd: string): UseJevTasks {
  const qc = useQueryClient();
  const listTasks = useRpc(JevListTasksRpc);
  const statsRpc = useRpc(JevStatsRpc);
  const addRpc = useRpc(JevAddTaskRpc);
  const updateRpc = useRpc(JevUpdateTaskRpc);
  const judgeRpc = useRpc(JevJudgeTaskRpc);
  const judgeAllRpc = useRpc(JevJudgeAllRpc);
  const reopenRpc = useRpc(JevReopenTaskRpc);
  const resolveRpc = useRpc(JevResolveTaskRpc);
  const removeRpc = useRpc(JevRemoveTaskRpc);

  const settings = useSettings(jevSettings);
  const settingsValues = settings.status === "ready" ? settings.values : null;
  const config = useMemo(() => settingsValues ?? jevSettingsSchema.parse({}), [settingsValues]);

  const tasksKey = useMemo(() => ["jev", "tasks", workspaceId, agentId] as const, [workspaceId, agentId]);
  const statsKey = useMemo(() => ["jev", "stats", agentId] as const, [agentId]);

  const tasksQuery = useQuery({ queryKey: tasksKey, queryFn: () => listTasks({ workspaceId, agentId }) });
  const statsQuery = useQuery({ queryKey: statsKey, queryFn: () => statsRpc({ agentId }) });

  const invTasks = () => qc.invalidateQueries({ queryKey: tasksKey });
  const invBoth = () =>
    Promise.all([qc.invalidateQueries({ queryKey: tasksKey }), qc.invalidateQueries({ queryKey: statsKey })]);

  // add / update / remove don't touch the decision log → only the tasks query needs refresh.
  const addM = useMutation({ mutationFn: (input: AddTaskInput) => addRpc({ workspaceId, agentId, cwd, ...input }), onSuccess: invTasks });
  const updateM = useMutation({ mutationFn: (v: { id: string; input: AddTaskInput }) => updateRpc({ id: v.id, ...v.input }), onSuccess: invTasks });
  const removeM = useMutation({ mutationFn: (id: string) => removeRpc({ id }), onSuccess: invTasks });
  // judge / resolve / rejudge / judge-all also write the log → refresh tasks + stats.
  const judgeM = useMutation({ mutationFn: (v: { id: string; model?: string }) => judgeRpc({ id: v.id, model: v.model, config }), onSuccess: invBoth });
  const rejudgeM = useMutation({
    mutationFn: async (v: { id: string; model?: string }) => {
      await reopenRpc({ id: v.id }); // back to pending so the guarded judge can overwrite
      return judgeRpc({ id: v.id, model: v.model, config });
    },
    onSuccess: invBoth,
  });
  const resolveM = useMutation({ mutationFn: (v: { id: string; choiceKey: string }) => resolveRpc({ id: v.id, choiceKey: v.choiceKey }), onSuccess: invBoth });
  const judgeAllM = useMutation({ mutationFn: () => judgeAllRpc({ workspaceId, agentId, config }), onSuccess: invBoth });

  const busyId =
    pendingId(judgeM) ?? pendingId(rejudgeM) ?? pendingId(resolveM) ?? pendingId(removeM) ?? pendingId(updateM);
  const busyAll = judgeAllM.isPending;

  const wrap = async (p: Promise<{ ok: boolean; note?: string }>): Promise<Result> => {
    try {
      const res = await p;
      return res.ok ? { ok: true } : { ok: false, note: res.note };
    } catch (e) {
      return { ok: false, note: errMsg(e) };
    }
  };

  const tasks = tasksQuery.data?.tasks ?? [];
  const pending = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const resolved = useMemo(() => tasks.filter((t) => t.status === "resolved"), [tasks]);

  return {
    tasks,
    pending,
    resolved,
    stats: statsQuery.data ?? null,
    busyId,
    busyAll,
    refresh: async () => {
      await invBoth();
    },
    add: (input) => wrap(addM.mutateAsync(input)),
    update: (id, input) => wrap(updateM.mutateAsync({ id, input })),
    judge: (id, model) => wrap(judgeM.mutateAsync({ id, model })),
    judgeAll: async () => {
      try {
        return await judgeAllM.mutateAsync();
      } catch (e) {
        return { resolved: 0, note: errMsg(e) };
      }
    },
    rejudge: (id, model) => wrap(rejudgeM.mutateAsync({ id, model })),
    resolve: (id, choiceKey) => wrap(resolveM.mutateAsync({ id, choiceKey })),
    remove: async (id) => {
      try {
        await removeM.mutateAsync(id);
      } catch {
        // best-effort; the row stays until the next refresh
      }
    },
  };
}
