// v0.2.0: the judge-task queue — shared by the workspace panel and the composer-pill popover.
// Shows every pending decision; each row can be resolved by the USER (tap an option) or by a
// MODEL (tap "Ask model"). Resolving emits the decision card into the session timeline.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { jevSettings } from "../shared/settings";
import { JevExportRpc } from "../shared/rpc";
import { taskOptions, type JevTask } from "../shared/task";
import { toCsv } from "./csv";
import { downloadCsv } from "./web";
import { Button, Chip, Dropdown } from "./ui";
import { font, iconSize, radius, space, weight } from "./theme";
import { DecisionCardView } from "./card";
import { CalibrationView } from "./calibration";
import { JevForm } from "./form";
import { shortModel, useJevModels, useJevTasks, type JevModel } from "./use-jev";

// Remember each agent's "decide with" pick for the session, so reopening the queue keeps it instead
// of snapping back to the default model.
const rememberedModel = new Map<string, string>();

function TaskRow({
  theme,
  task,
  busy,
  disabled,
  activeModel,
  onJudge,
  onResolve,
  onRemove,
  onEdit,
}: {
  theme: PluginTheme;
  task: JevTask;
  busy: boolean;
  /** another row (or "ask all") is in flight — block this row's judge to avoid a duplicate call */
  disabled: boolean;
  activeModel: string;
  onJudge: (id: string) => void;
  onResolve: (id: string, key: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const c = theme.colors;
  const opts = taskOptions(task);
  const modelLabel = shortModel(task.model || activeModel || "default model");
  return (
    <View
      style={{
        gap: space[2],
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.lg,
        padding: space[3],
        backgroundColor: c.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Text style={{ color: c.foreground, fontWeight: weight.semibold, fontSize: font.base, flex: 1 }}>
          {task.instructions}
        </Text>
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{task.type}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="edit task"
          hitSlop={8}
          disabled={busy}
          onPress={() => onEdit(task.id)}
        >
          <Icon name="Pencil" size={iconSize.sm} color={c.foregroundMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="remove task"
          hitSlop={8}
          disabled={busy}
          onPress={() => onRemove(task.id)}
        >
          <Icon name="X" size={iconSize.sm} color={c.foregroundMuted} />
        </Pressable>
      </View>

      {task.description ? (
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{task.description}</Text>
      ) : null}

      <Text style={{ color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" }}>you decide</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1.5] }}>
        {opts.map((o) => (
          <Chip key={o.key} theme={theme} active={false} disabled={busy} label={o.label} onPress={() => onResolve(task.id, o.key)} />
        ))}
      </View>

      <Button
        theme={theme}
        block
        icon="Sparkles"
        busy={busy}
        disabled={disabled}
        onPress={() => onJudge(task.id)}
        label={busy ? "judging…" : `ask ${modelLabel}${task.strict ? " · STRICT" : ""}`}
      />
    </View>
  );
}

function ResolvedRow({
  theme,
  task,
  busy,
  activeModel,
  onRejudge,
}: {
  theme: PluginTheme;
  task: JevTask;
  busy: boolean;
  activeModel: string;
  onRejudge: (id: string) => void;
}) {
  const c = theme.colors;
  const r = task.result;
  const by = task.decidedBy === "user" ? "by you" : `by ${r?.model || "model"}`;
  const [open, setOpen] = useState(false);
  const canExpand = Boolean(r);
  return (
    <View style={{ gap: space[1] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        disabled={!canExpand}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[1] }}
      >
        <Icon name="Check" size={iconSize.sm} color={c.statusSuccess} />
        <Text style={{ color: c.foreground, fontSize: font.base, flex: 1 }} numberOfLines={1}>
          {r?.answerLabel ?? "resolved"}
        </Text>
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>
          {r?.verdict} · {by}
        </Text>
        {canExpand ? (
          <Icon name={busy ? "Loader" : open ? "ChevronDown" : "ChevronRight"} size={iconSize.sm} color={c.foregroundMuted} />
        ) : null}
      </Pressable>
      {open && r ? (
        <View style={{ gap: space[2] }}>
          <DecisionCardView theme={theme} card={r} />
          <Button
            theme={theme}
            variant="secondary"
            icon="RotateCw"
            busy={busy}
            onPress={() => onRejudge(task.id)}
            label={busy ? "re-judging…" : `re-judge with ${shortModel(activeModel || "default model")}`}
          />
        </View>
      ) : null}
    </View>
  );
}

export function JevQueueScreen({
  theme,
  workspaceId,
  agentId,
  cwd,
  compact,
}: {
  theme: PluginTheme;
  workspaceId: string;
  agentId: string;
  cwd: string;
  compact?: boolean;
}) {
  const c = theme.colors;
  const settings = useSettings(jevSettings);
  const { models, note: modelsNote } = useJevModels(cwd);
  const { pending, resolved, stats, busyId, busyAll, add, update, judge, judgeAll, rejudge, resolve, remove } =
    useJevTasks(workspaceId, agentId, cwd);
  const toast = useToast();
  const exportRpc = useRpc(JevExportRpc);
  const [activeModel, setActiveModelState] = useState(() => rememberedModel.get(agentId) ?? "");
  const [showAdd, setShowAdd] = useState(false);
  const [showCalib, setShowCalib] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTask = editingId ? pending.find((t) => t.id === editingId) ?? null : null;

  const setActiveModel = useCallback(
    (m: string) => {
      rememberedModel.set(agentId, m);
      setActiveModelState(m);
    },
    [agentId],
  );

  // In-app nudge: toast when the agent pushes a new [jev] task that needs your call. Marker-only, so
  // it never fires for tasks you added yourself. (Paseo exposes no plugin OS/push API — see the
  // feature request in docs/; this is the in-app ceiling, visible only while Jev is open.)
  const seenMarkers = useRef<Set<string> | null>(null);
  useEffect(() => {
    const markerIds = new Set(pending.filter((t) => t.source === "marker").map((t) => t.id));
    if (seenMarkers.current === null) {
      seenMarkers.current = markerIds; // seed on first load; don't toast the backlog
      return;
    }
    const fresh = [...markerIds].filter((id) => !seenMarkers.current!.has(id)).length;
    seenMarkers.current = markerIds;
    if (fresh > 0) toast.show(`${fresh} judge task${fresh > 1 ? "s" : ""} from the agent need your call`, { variant: "info" });
  }, [pending, toast]);

  useEffect(() => {
    // seed only when this agent has no remembered pick yet
    if (settings.status !== "ready" || rememberedModel.has(agentId)) return;
    const configured = settings.values.defaultModel;
    if (configured) return setActiveModelState(configured);
    // no configured default → fall back to the provider's default so a fresh install can judge
    const providerDefault = models.find((m) => m.isDefault)?.id ?? models[0]?.id;
    if (providerDefault) setActiveModelState(providerDefault);
  }, [settings.status, agentId, models]);

  const onJudge = useCallback(
    async (id: string) => {
      const r = await judge(id, activeModel || undefined);
      if (!r.ok) toast.error(r.note ?? "judge failed");
    },
    [judge, activeModel, toast],
  );
  const onResolve = useCallback(
    async (id: string, key: string) => {
      const r = await resolve(id, key);
      if (!r.ok) toast.error(r.note ?? "could not resolve");
    },
    [resolve, toast],
  );
  const onRemove = useCallback((id: string) => void remove(id), [remove]);
  const onJudgeAll = useCallback(async () => {
    const r = await judgeAll();
    if (r.resolved) toast.show(`judged ${r.resolved}`, { variant: "success" });
    else toast.show(r.note ?? "nothing judged", { variant: "warning" });
  }, [judgeAll, toast]);
  const onRejudge = useCallback(
    async (id: string) => {
      const r = await rejudge(id, activeModel || undefined);
      if (!r.ok) toast.error(r.note ?? "re-judge failed");
    },
    [rejudge, activeModel, toast],
  );
  const onExportCsv = useCallback(async () => {
    try {
      const { records } = await exportRpc({ agentId });
      if (!records.length) return toast.show("No decisions to export yet", { variant: "info" });
      const ok = downloadCsv("jev-decisions.csv", toCsv(records));
      toast.show(ok ? `Exported ${records.length} decisions` : "Export needs the desktop or web app", {
        variant: ok ? "success" : "warning",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }, [exportRpc, agentId, toast]);

  const s = useMemo(
    () => ({
      screen: { padding: compact ? space[2] : space[3], gap: space[2], backgroundColor: c.surface0 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: space[2] },
      title: { color: c.foreground, fontWeight: weight.bold, fontSize: font.lg, flex: 1 },
      count: { color: c.accentForeground, backgroundColor: c.accent, fontSize: font.sm, fontWeight: weight.semibold, paddingHorizontal: space[1.5], paddingVertical: 2, borderRadius: radius.full, overflow: "hidden" as const },
      label: { color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" as const },
      muted: { color: c.foregroundMuted, fontSize: font.sm },
    }),
    [c, compact],
  );

  return (
    <ScrollView style={{ flex: 1, maxHeight: compact ? 420 : undefined }} contentContainerStyle={s.screen}>
      <View style={s.header}>
        <Icon name="Scale" size={iconSize.md} color={c.foreground} />
        <Text style={s.title}>Judge tasks</Text>
        <Text style={s.count}>{pending.length} pending</Text>
        <Chip
          theme={theme}
          active={showAdd}
          label={showAdd ? "close" : "＋ new"}
          onPress={() => {
            setEditingId(null);
            setShowAdd((v) => !v);
          }}
        />
      </View>

      {showAdd || editingTask ? (
        <JevForm
          key={editingTask ? editingTask.id : "add"}
          theme={theme}
          models={models}
          modelsNote={modelsNote}
          compact={compact}
          submit={editingTask ? (input) => update(editingTask.id, input) : add}
          submitLabel={editingTask ? "Save changes" : undefined}
          initial={
            editingTask
              ? {
                  type: editingTask.type,
                  instructions: editingTask.instructions,
                  description: editingTask.description,
                  options: editingTask.options,
                  model: editingTask.model,
                  strict: editingTask.strict,
                  state: editingTask.state,
                }
              : undefined
          }
          onDone={() => {
            setShowAdd(false);
            setEditingId(null);
          }}
        />
      ) : null}

      <Dropdown
        theme={theme}
        label="decide with"
        items={[
          { key: "", label: "default" },
          ...models.map((m) => ({ key: m.id, label: m.label, hint: m.isDefault ? `${m.provider} · default` : m.provider })),
        ]}
        selectedKey={activeModel}
        onSelect={setActiveModel}
        placeholder="default"
      />
      {models.length === 0 && modelsNote ? <Text style={s.muted}>{modelsNote}</Text> : null}

      {pending.length > 1 ? (
        <Button
          theme={theme}
          block
          icon="Sparkles"
          busy={busyAll}
          disabled={busyId !== null}
          onPress={onJudgeAll}
          label={busyAll ? "judging all…" : `ask all (${pending.length}) · one call`}
        />
      ) : null}

      {pending.length === 0 ? (
        <Text style={s.muted}>No pending judge tasks. Add one with “＋ new”.</Text>
      ) : (
        pending.map((t) => (
          <TaskRow
            key={t.id}
            theme={theme}
            task={t}
            busy={busyId === t.id}
            disabled={busyAll || (busyId !== null && busyId !== t.id)}
            activeModel={activeModel}
            onJudge={onJudge}
            onResolve={onResolve}
            onRemove={onRemove}
            onEdit={setEditingId}
          />
        ))
      )}

      {resolved.length ? <Text style={s.label}>resolved</Text> : null}
      {resolved.slice(0, compact ? 3 : 8).map((t) => (
        <ResolvedRow
          key={t.id}
          theme={theme}
          task={t}
          busy={busyId === t.id}
          activeModel={activeModel}
          onRejudge={onRejudge}
        />
      ))}

      {stats && stats.total > 0 ? (
        <View style={{ gap: space[1], marginTop: space[1] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showCalib }}
            hitSlop={6}
            onPress={() => setShowCalib((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}
          >
            <Icon name="ChartColumn" size={iconSize.sm} color={c.foregroundMuted} />
            <Text style={[s.muted, { flex: 1 }]}>
              {stats.total} decisions · {stats.byModel} model / {stats.byUser} you
              {stats.byModel > 0 ? ` · conf ${Math.round(stats.meanConfidence * 100)}%` : ""}
              {stats.agreementRate !== null ? ` · agree ${Math.round(stats.agreementRate * 100)}%` : ""}
            </Text>
            <Icon name={showCalib ? "ChevronDown" : "ChevronRight"} size={iconSize.sm} color={c.foregroundMuted} />
          </Pressable>
          {showCalib ? <CalibrationView theme={theme} stats={stats} onExportCsv={onExportCsv} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
