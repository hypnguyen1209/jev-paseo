// v0.2.0: the judge-task queue — shared by the workspace panel and the composer-pill popover.
// Shows every pending decision; each row can be resolved by the USER (tap an option) or by a
// MODEL (tap "Ask model"). Resolving emits the decision card into the session timeline.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { jevSettings } from "../shared/settings";
import { taskOptions, type JevTask } from "../shared/task";
import { Button, Chip, Dropdown } from "./ui";
import { font, iconSize, radius, space, weight } from "./theme";
import { DecisionCardView } from "./card";
import { JevForm } from "./form";
import { shortModel, useJevModels, useJevTasks, type JevModel } from "./use-jev";

function TaskRow({
  theme,
  task,
  busy,
  disabled,
  activeModel,
  onJudge,
  onResolve,
  onRemove,
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
          accessibilityLabel="remove task"
          hitSlop={8}
          disabled={busy}
          onPress={() => onRemove(task.id)}
        >
          <Icon name="X" size={iconSize.sm} color={c.foregroundMuted} />
        </Pressable>
      </View>

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

function ResolvedRow({ theme, task }: { theme: PluginTheme; task: JevTask }) {
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
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={iconSize.sm} color={c.foregroundMuted} />
        ) : null}
      </Pressable>
      {open && r ? <DecisionCardView theme={theme} card={r} /> : null}
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
      setNote(r.ok ? null : r.note ?? "could not resolve"); // clear any stale judge error on success
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
      screen: { padding: compact ? space[2] : space[3], gap: space[2], backgroundColor: c.surface0 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: space[2] },
      title: { color: c.foreground, fontWeight: weight.bold, fontSize: font.lg, flex: 1 },
      count: { color: c.accentForeground, backgroundColor: c.accent, fontSize: font.sm, fontWeight: weight.semibold, paddingHorizontal: space[1.5], paddingVertical: 2, borderRadius: radius.full, overflow: "hidden" as const },
      label: { color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" as const },
      muted: { color: c.foregroundMuted, fontSize: font.sm },
      note: { color: c.statusDanger, fontSize: font.sm },
    }),
    [c, compact],
  );

  return (
    <ScrollView style={{ flex: 1, maxHeight: compact ? 420 : undefined }} contentContainerStyle={s.screen}>
      <View style={s.header}>
        <Icon name="Scale" size={iconSize.md} color={c.foreground} />
        <Text style={s.title}>Judge tasks</Text>
        <Text style={s.count}>{pending.length} pending</Text>
        <Chip theme={theme} active={showAdd} label={showAdd ? "close" : "＋ new"} onPress={() => setShowAdd((v) => !v)} />
      </View>

      {showAdd ? (
        <JevForm theme={theme} add={add} models={models} modelsNote={modelsNote} compact={compact} onAdded={() => setShowAdd(false)} />
      ) : null}

      <Dropdown
        theme={theme}
        label="decide with"
        items={[{ key: "", label: "default" }, ...models.map((m) => ({ key: m.id, label: m.label, hint: m.provider }))]}
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
          />
        ))
      )}

      {note ? <Text style={s.note}>{note}</Text> : null}

      {resolved.length ? <Text style={s.label}>resolved</Text> : null}
      {resolved.slice(0, compact ? 3 : 8).map((t) => (
        <ResolvedRow key={t.id} theme={theme} task={t} />
      ))}

      {stats && stats.total > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], marginTop: space[1] }}>
          <Icon name="ChartColumn" size={iconSize.sm} color={c.foregroundMuted} />
          <Text style={s.muted}>
            {stats.total} decisions · {stats.byModel} model / {stats.byUser} you
            {stats.byModel > 0 ? ` · conf ${Math.round(stats.meanConfidence * 100)}%` : ""}
            {stats.agreementRate !== null
              ? ` · you-vs-model agree ${Math.round(stats.agreementRate * 100)}% (${stats.compared})`
              : ""}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
