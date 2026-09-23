// v0.2.0: shared client data hooks for every jev surface (panel, composer popover).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
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
};

export interface JevModel {
  id: string;
  label: string;
  /** The provider (agent harness) that serves this model: claude, codex, pi, minimax, etc. */
  provider: string;
}

/** Show just the model half of `provider/model` so labels don't overflow. */
export const shortModel = (id: string) => (id.includes("/") ? id.slice(id.indexOf("/") + 1) : id);

export function useJevModels(cwd?: string): { models: JevModel[]; note: string | null } {
  const listModels = useRpc(JevModelsRpc);
  const [models, setModels] = useState<JevModel[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listModels(cwd ? { cwd } : {}) // cwd scopes provider discovery to the workspace
      .then((r) => {
        if (!live) return;
        setModels(r.models.map((m) => ({ id: m.id, label: shortModel(m.id), provider: m.provider })));
        setNote(r.note ?? null);
      })
      .catch((e) => {
        if (live) setNote(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [listModels, cwd]);
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
  judge: (id: string, model?: string) => Promise<Result>;
  judgeAll: () => Promise<{ resolved: number; note?: string }>;
  rejudge: (id: string, model?: string) => Promise<Result>;
  resolve: (id: string, choiceKey: string) => Promise<Result>;
  remove: (id: string) => Promise<void>;
}

export function useJevTasks(workspaceId: string, agentId: string, cwd: string): UseJevTasks {
  const listTasks = useRpc(JevListTasksRpc);
  const addRpc = useRpc(JevAddTaskRpc);
  const judgeRpc = useRpc(JevJudgeTaskRpc);
  const judgeAllRpc = useRpc(JevJudgeAllRpc);
  const reopenRpc = useRpc(JevReopenTaskRpc);
  const resolveRpc = useRpc(JevResolveTaskRpc);
  const removeRpc = useRpc(JevRemoveTaskRpc);
  const statsRpc = useRpc(JevStatsRpc);
  const settings = useSettings(jevSettings);
  const configReady = settings.status === "ready" ? settings.values : null;
  const config = useMemo(() => configReady ?? jevSettingsSchema.parse({}), [configReady]);
  const [tasks, setTasks] = useState<JevTask[]>([]);
  const [stats, setStats] = useState<JevStats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const refresh = useCallback(
    async (withStats = true) => {
      try {
        const r = await listTasks({ workspaceId, agentId });
        setTasks(r.tasks);
      } catch {
        // leave the last snapshot in place on a transient failure
      }
      if (withStats) {
        try {
          setStats(await statsRpc({ agentId }));
        } catch {
          // stats are best-effort
        }
      }
    },
    [listTasks, statsRpc, workspaceId, agentId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (input: AddTaskInput): Promise<Result> => {
      const res = await addRpc({ workspaceId, agentId, cwd, ...input });
      await refresh(false); // add doesn't touch the decision log
      return res.ok ? { ok: true } : { ok: false, note: res.note };
    },
    [addRpc, workspaceId, agentId, cwd, refresh],
  );

  const judge = useCallback(
    async (id: string, model?: string): Promise<Result> => {
      setBusyId(id);
      try {
        const res = await judgeRpc({ id, model, config });
        await refresh();
        return res.ok ? { ok: true } : { ok: false, note: res.note };
      } finally {
        setBusyId(null);
      }
    },
    [judgeRpc, refresh, config],
  );

  const rejudge = useCallback(
    async (id: string, model?: string): Promise<Result> => {
      setBusyId(id);
      try {
        await reopenRpc({ id }); // back to pending so the guarded judge can overwrite
        const res = await judgeRpc({ id, model, config });
        await refresh();
        return res.ok ? { ok: true } : { ok: false, note: res.note };
      } finally {
        setBusyId(null);
      }
    },
    [reopenRpc, judgeRpc, refresh, config],
  );

  const judgeAll = useCallback(async (): Promise<{ resolved: number; note?: string }> => {
    setBusyAll(true);
    try {
      const r = await judgeAllRpc({ workspaceId, agentId, config });
      await refresh();
      return r;
    } finally {
      setBusyAll(false);
    }
  }, [judgeAllRpc, workspaceId, agentId, refresh, config]);

  const resolve = useCallback(
    async (id: string, choiceKey: string): Promise<Result> => {
      setBusyId(id); // block a double-tap firing a second resolve on an already-resolved task
      try {
        const res = await resolveRpc({ id, choiceKey });
        await refresh();
        return res.ok ? { ok: true } : { ok: false, note: res.note };
      } finally {
        setBusyId(null);
      }
    },
    [resolveRpc, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setBusyId(id);
      try {
        await removeRpc({ id });
        await refresh(false); // remove doesn't touch the decision log
      } finally {
        setBusyId(null);
      }
    },
    [removeRpc, refresh],
  );

  const pending = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const resolved = useMemo(() => tasks.filter((t) => t.status === "resolved"), [tasks]);

  return { tasks, pending, resolved, stats, busyId, busyAll, refresh, add, judge, judgeAll, rejudge, resolve, remove };
}
