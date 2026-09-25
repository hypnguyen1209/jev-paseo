// v0.7.0: defaults for the LLM judge. No hosted-model dependency; `samples` controls jev-style
// self-consistency (1 = one self-reported distribution; ≥3 = K votes tallied → calibrated).
import { useCallback, useMemo } from "react";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { jevSettings } from "../shared/settings";
import { JevModelsRpc } from "../shared/rpc";

const THRESHOLDS = [
  { label: "70%", value: "0.7" },
  { label: "80%", value: "0.8" },
  { label: "90%", value: "0.9" },
  { label: "95%", value: "0.95" },
];
const FLOORS = [
  { label: "50%", value: "0.5" },
  { label: "60%", value: "0.6" },
  { label: "70%", value: "0.7" },
];
const ROUNDS = [
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
];
const SAMPLES = [
  { label: "1 (fast, self-reported)", value: "1" },
  { label: "3 (voted)", value: "3" },
  { label: "5 (calibrated)", value: "5" },
  { label: "7", value: "7" },
];

export function JevSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(jevSettings);
  const listModels = useRpc(JevModelsRpc);
  const modelsQuery = useQuery({
    queryKey: ["jev", "models", ""] as const, // shares the cache with useJevModels()
    queryFn: () => listModels({}),
    staleTime: 5 * 60_000,
  });
  const models = useMemo(
    () => [{ label: "(none)", value: "" }, ...(modelsQuery.data?.models ?? []).map((m) => ({ label: m.id, value: m.id }))],
    [modelsQuery.data],
  );
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);

  const save = useCallback(
    (patch: Record<string, unknown>) => {
      if (settings.status !== "ready") return;
      void settings.save({ ...settings.values, ...patch }, settings.revision);
    },
    [settings],
  );

  if (settings.status === "loading") return <Text style={style}>Loading…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Jev">
        <Text style={style}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="Restore defaults" actionLabel="Reset" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );

  const v = settings.values;
  return (
    <SettingsSection title="Jev — model-agnostic decisions">
      <SettingsCard>
        <SettingsSelect
          label="Judge model"
          value={v.defaultModel}
          options={models}
          disabled={settings.saving}
          onValueChange={(defaultModel) => save({ defaultModel })}
        />
        <SettingsSelect
          label="Self-consistency samples (≥3 = calibrated votes; K× cost)"
          value={String(v.samples)}
          options={SAMPLES}
          disabled={settings.saving}
          onValueChange={(s) => save({ samples: Number(s) })}
        />
        {v.samples > 1 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Voting needs a provider that samples (temperature &gt; 0). Claude Code and Codex do by default; a
            deterministic provider returns {v.samples} identical votes, so confidence collapses to 0% or 100%.
          </Text>
        ) : null}
        <SettingsSwitch
          label="STRICT by default (re-judge until confident)"
          value={v.strict}
          disabled={settings.saving}
          onValueChange={(strict) => save({ strict })}
        />
        <SettingsSwitch
          label="Shadow mode (judge + log, leave tasks pending)"
          value={v.shadow}
          disabled={settings.saving}
          onValueChange={(shadow) => save({ shadow })}
        />
        <SettingsSwitch
          label="Send the verdict back to the agent (tasks it pushed via [jev])"
          value={v.feedback}
          disabled={settings.saving}
          onValueChange={(feedback) => save({ feedback })}
        />
        <SettingsSwitch
          label="…including tasks you created yourself, not just the agent's"
          value={v.feedbackAll}
          disabled={settings.saving || !v.feedback}
          onValueChange={(feedbackAll) => save({ feedbackAll })}
        />
        <SettingsSelect
          label="Auto-accept — high band (STRICT gate)"
          value={String(v.threshold)}
          options={THRESHOLDS}
          disabled={settings.saving}
          onValueChange={(t) => save({ threshold: Number(t) })}
        />
        <SettingsSelect
          label="Review floor — medium band"
          value={String(v.reviewFloor)}
          options={FLOORS}
          disabled={settings.saving}
          onValueChange={(r) => save({ reviewFloor: Number(r) })}
        />
        <SettingsSelect
          label="Max judge rounds"
          value={String(v.maxRounds)}
          options={ROUNDS}
          disabled={settings.saving}
          onValueChange={(r) => save({ maxRounds: Number(r) })}
        />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          Worst case per STRICT task: {v.samples} sample{v.samples > 1 ? "s" : ""} × {v.maxRounds} round
          {v.maxRounds > 1 ? "s" : ""} = {v.samples * v.maxRounds} model calls.
        </Text>
      </SettingsCard>

      {settings.saveError ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>
          {settings.saveError}
        </Text>
      ) : null}
    </SettingsSection>
  );
}
