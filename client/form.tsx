// v0.2.0: the "new judge task" form. Shared by the panel and the composer popover. Adds a pending
// task to the queue; the task is later resolved by the user or a model from the queue list.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { jevSettings } from "../shared/settings";
import { PRESETS, type Preset } from "../shared/presets";
import { Chip } from "./ui";
import { useJevModels, type AddTaskInput } from "./use-jev";

type DecisionType = "choice" | "score" | "noul";

export function JevForm({
  theme,
  add,
  compact,
  onAdded,
}: {
  theme: PluginTheme;
  add: (input: AddTaskInput) => Promise<{ ok: boolean; note?: string }>;
  compact?: boolean;
  onAdded?: () => void;
}) {
  const c = theme.colors;
  const settings = useSettings(jevSettings);
  const { models, note: modelsNote } = useJevModels();
  const [model, setModel] = useState("");
  const [type, setType] = useState<DecisionType>("choice");
  const [strict, setStrict] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [stateText, setStateText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || settings.status !== "ready") return;
    seededRef.current = true;
    setModel((m) => m || settings.values.defaultModel);
    setStrict(settings.values.strict);
  }, [settings.status]);

  const options = useMemo(
    () => optionsText.split("\n").map((s) => s.trim()).filter(Boolean),
    [optionsText],
  );
  const needsOptions = type !== "noul";
  const canAdd = !busy && instructions.trim().length > 0 && (!needsOptions || options.length >= 2);

  const submit = useCallback(async () => {
    if (!canAdd) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await add({
        type,
        instructions: instructions.trim(),
        options,
        model: model || undefined,
        strict,
        state: stateText.trim() || undefined,
      });
      if (res.ok) {
        setInstructions("");
        setOptionsText("");
        setStateText("");
        onAdded?.();
      } else {
        setNote(res.note ?? "could not add");
      }
    } finally {
      setBusy(false);
    }
  }, [canAdd, add, type, instructions, options, model, strict, stateText, onAdded]);

  const pad = compact ? 8 : 12;
  const s = useMemo(
    () => ({
      label: { color: c.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const },
      input: {
        color: c.foreground,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 6,
        padding: 8,
        backgroundColor: c.surface1,
      },
      add: {
        borderRadius: 8,
        padding: 10,
        alignItems: "center" as const,
        backgroundColor: canAdd ? c.accent : c.surface2,
      },
      addText: { color: canAdd ? c.accentForeground : c.foregroundMuted, fontWeight: "600" as const },
      note: { color: c.statusDanger, fontSize: 12 },
      muted: { color: c.foregroundMuted, fontSize: 12 },
    }),
    [c, canAdd],
  );

  const applyPreset = useCallback((p: Preset) => {
    setType(p.type);
    setStrict(p.strict);
    setInstructions(p.instructions);
    setOptionsText(p.options.join("\n"));
    setNote(null);
  }, []);

  return (
    <View style={{ gap: 8, padding: pad, backgroundColor: c.surface1, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
      <Text style={s.label}>presets (recipes)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {PRESETS.map((p) => (
          <Chip key={p.key} theme={theme} active={false} label={p.label} onPress={() => applyPreset(p)} />
        ))}
      </ScrollView>

      <Text style={s.label}>Preferred model (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip theme={theme} active={model === ""} label="default" onPress={() => setModel("")} />
        {models.map((m) => (
          <Chip key={m.id} theme={theme} active={m.id === model} label={m.label} onPress={() => setModel(m.id)} />
        ))}
      </ScrollView>
      {models.length === 0 ? <Text style={s.muted}>{modelsNote ?? "loading models…"}</Text> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip theme={theme} active={type === "choice"} label="choice" onPress={() => setType("choice")} />
        <Chip theme={theme} active={type === "score"} label="score" onPress={() => setType("score")} />
        <Chip theme={theme} active={type === "noul"} label="yes / no" onPress={() => setType("noul")} />
        <Chip theme={theme} active={strict} label={strict ? "STRICT ✓" : "STRICT"} onPress={() => setStrict((x) => !x)} />
      </View>

      <TextInput
        style={s.input}
        placeholder="Question — e.g. Is the login bug actually fixed?"
        placeholderTextColor={c.foregroundMuted}
        value={instructions}
        onChangeText={setInstructions}
        multiline
      />

      {needsOptions ? (
        <TextInput
          style={[s.input, { minHeight: 56 }]}
          placeholder={type === "score" ? "options low→high, one per line\nterrible\npoor\nok\ngood\nexcellent" : "one option per line\nrollback\nhotfix"}
          placeholderTextColor={c.foregroundMuted}
          value={optionsText}
          onChangeText={setOptionsText}
          multiline
        />
      ) : null}

      {compact ? null : (
        <TextInput
          style={[s.input, { minHeight: 40 }]}
          placeholder="Evidence (optional — defaults to recent session)"
          placeholderTextColor={c.foregroundMuted}
          value={stateText}
          onChangeText={setStateText}
          multiline
        />
      )}

      <Pressable accessibilityRole="button" onPress={submit} disabled={!canAdd} style={s.add}>
        <Text style={s.addText}>{busy ? "Adding…" : "＋ Add judge task"}</Text>
      </Pressable>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}
