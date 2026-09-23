// v0.2.0: the judge-task queue — shared by the workspace panel and the composer-pill popover.
// Shows every pending decision; each row can be resolved by the USER (tap an option) or by a
// MODEL (tap "Ask model"). Resolving emits the decision card into the session timeline.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { jevSettings } from "../shared/settings";
import { taskOptions, type JevTask } from "../shared/task";
import { Chip, Dropdown } from "./ui";
import { JevForm } from "./form";
import { useJevModels, useJevTasks } from "./use-jev";

function TaskRow({
  theme,
  task,
  busy,
  activeModel,
  onJudge,
  onResolve,
  onRemove,
}: {
  theme: PluginTheme;
  task: JevTask;
  busy: boolean;
  activeModel: string;
  onJudge: (id: string) => void;
  onResolve: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const c = theme.colors;
  const opts = taskOptions(task);
  const modelLabel = task.model || activeModel || "default model";
  return (
    <View
      style={{
        gap: 8,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        padding: 10,
        backgroundColor: c.surface1,
      }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Text style={{ color: c.foreground, fontWeight: "600", flex: 1 }}>{task.instructions}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{task.type}</Text>
        <Pressable accessibilityRole="button" onPress={() => onRemove(task.id)}>
          <Text style={{ color: c.foregroundMuted }}>✕</Text>
        </Pressable>
      </View>

      <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>you decide:</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {opts.map((o) => (
          <Chip key={o.key} theme={theme} active={false} label={o.label} onPress={() => onResolve(task.id, o.key)} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => onJudge(task.id)}
        disabled={busy}
        style={{
          borderRadius: 8,
          paddingVertical: 8,
          alignItems: "center",
          backgroundColor: busy ? c.surface2 : c.accent,
        }}
      >
        <Text style={{ color: busy ? c.foregroundMuted : c.accentForeground, fontWeight: "600" }}>
          {busy ? "judging…" : `🤖 ask ${modelLabel}${task.strict ? " · STRICT" : ""}`}
        </Text>
      </Pressable>
    </View>
  );
}

function ResolvedRow({ theme, task }: { theme: PluginTheme; task: JevTask }) {
  const c = theme.colors;
  const r = task.result;
  const by = task.decidedBy === "user" ? "by you" : `by ${r?.model || "model"}`;
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 3 }}>
      <Text style={{ color: c.statusSuccess }}>✓</Text>
      <Text style={{ color: c.foreground, flex: 1 }} numberOfLines={1}>
        {r?.answerLabel ?? "resolved"}
      </Text>
      <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>
        {r?.verdict} · {by}
      </Text>
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
  const { models } = useJevModels();
  const { pending, resolved, stats, busyId, busyAll, add, judge, judgeAll, resolve, remove } = useJevTasks(
    workspaceId,
    agentId,
    cwd,
  );
  const [activeModel, setActiveModel] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (settings.status === "ready" && !activeModel) setActiveModel(settings.values.defaultModel);
  }, [settings.status]);

  const onJudge = useCallback(
    async (id: string) => {
      const r = await judge(id, activeModel || undefined);
      setNote(r.ok ? null : r.note ?? "judge failed");
    },
    [judge, activeModel],
  );
  const onResolve = useCallback(
    async (id: string, key: string) => {
      const r = await resolve(id, key);
      if (!r.ok) setNote(r.note ?? "could not resolve");
    },
    [resolve],
  );
  const onRemove = useCallback((id: string) => void remove(id), [remove]);
  const onJudgeAll = useCallback(async () => {
    const r = await judgeAll();
    setNote(r.resolved ? null : r.note ?? "nothing judged");
  }, [judgeAll]);

  const s = useMemo(
    () => ({
      screen: { padding: compact ? 8 : 12, gap: 10, backgroundColor: c.surface0 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { color: c.foreground, fontWeight: "700" as const, flex: 1 },
      count: { color: c.accentForeground, backgroundColor: c.accent, fontSize: 11, fontWeight: "700" as const, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: "hidden" as const },
      label: { color: c.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const },
      muted: { color: c.foregroundMuted, fontSize: 12 },
      note: { color: c.statusDanger, fontSize: 12 },
    }),
    [c, compact],
  );

  return (
    <ScrollView style={{ flex: 1, maxHeight: compact ? 420 : undefined }} contentContainerStyle={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Judge tasks</Text>
        <Text style={s.count}>{pending.length} pending</Text>
        <Chip theme={theme} active={showAdd} label={showAdd ? "close" : "＋ new"} onPress={() => setShowAdd((v) => !v)} />
      </View>

      {showAdd ? <JevForm theme={theme} add={add} compact={compact} onAdded={() => setShowAdd(false)} /> : null}

      <Dropdown
        theme={theme}
        label="decide with"
        items={[{ key: "", label: "default" }, ...models.map((m) => ({ key: m.id, label: m.label }))]}
        selectedKey={activeModel}
        onSelect={setActiveModel}
        placeholder="default"
      />

      {pending.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onJudgeAll}
          disabled={busyAll}
          style={{ borderRadius: 8, paddingVertical: 8, alignItems: "center", backgroundColor: busyAll ? c.surface2 : c.accent }}
        >
          <Text style={{ color: busyAll ? c.foregroundMuted : c.accentForeground, fontWeight: "600" }}>
            {busyAll ? "judging all…" : `🤖 ask all (${pending.length}) — one call`}
          </Text>
        </Pressable>
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
            activeModel={activeModel}
            onJudge={onJudge}
            onResolve={onResolve}
            onRemove={onRemove}
          />
        ))
      )}

      {note ? <Text style={s.note}>{note}</Text> : null}

      {resolved.length ? <Text style={s.label}>resolved</Text> : null}
      {resolved.slice(0, compact ? 3 : 8).map((t) => (
        <ResolvedRow key={t.id} theme={theme} task={t} />
      ))}

      {stats && stats.total > 0 ? (
        <Text style={[s.muted, { marginTop: 6 }]}>
          📊 {stats.total} decisions · {stats.byModel} model / {stats.byUser} you
          {stats.byModel > 0 ? ` · conf ${Math.round(stats.meanConfidence * 100)}%` : ""}
          {stats.agreementRate !== null
            ? ` · you-vs-model agree ${Math.round(stats.agreementRate * 100)}% (${stats.compared})`
            : ""}
        </Text>
      ) : null}
    </ScrollView>
  );
}
