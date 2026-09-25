// v0.2.0: the "new judge task" form. Shared by the panel and the composer popover. Adds a pending
// task to the queue; the task is later resolved by the user or a model from the queue list.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { jevSettings } from "../shared/settings";
import { PRESETS, type Preset } from "../shared/presets";
import { Button, Chip, Dropdown } from "./ui";
import { font, radius, space } from "./theme";
import type { AddTaskInput, JevModel } from "./use-jev";

type DecisionType = "choice" | "score" | "noul";

interface JevFormInitial {
  type: DecisionType;
  instructions: string;
  description?: string;
  options: string[];
  model?: string;
  strict?: boolean;
  state?: string;
}

export function JevForm({
  theme,
  submit,
  models,
  modelsNote,
  initial,
  submitLabel,
  compact,
  onDone,
}: {
  theme: PluginTheme;
  submit: (input: AddTaskInput) => Promise<{ ok: boolean; note?: string }>;
  models: JevModel[];
  modelsNote: string | null;
  /** pre-fill for edit mode; when set, the settings defaults are not applied */
  initial?: JevFormInitial;
  submitLabel?: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const c = theme.colors;
  const editing = Boolean(initial);
  const settings = useSettings(jevSettings);
  const [model, setModel] = useState(initial?.model ?? "");
  const [type, setType] = useState<DecisionType>(initial?.type ?? "choice");
  const [strict, setStrict] = useState(initial?.strict ?? true);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [optionsText, setOptionsText] = useState(initial?.options.join("\n") ?? "");
  const [stateText, setStateText] = useState(initial?.state ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seededRef = useRef(editing); // editing rows arrive pre-seeded; don't stomp them with defaults

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

  const onSubmit = useCallback(async () => {
    if (!canAdd) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await submit({
        type,
        instructions: instructions.trim(),
        description: description.trim() || undefined,
        options,
        model: model || undefined,
        strict,
        state: stateText.trim() || undefined,
      });
      if (res.ok) {
        if (!editing) {
          setInstructions("");
          setDescription("");
          setOptionsText("");
          setStateText("");
        }
        onDone?.();
      } else {
        setNote(res.note ?? "could not save");
      }
    } finally {
      setBusy(false);
    }
  }, [canAdd, submit, type, instructions, description, options, model, strict, stateText, editing, onDone]);

  const pad = compact ? space[2] : space[3];
  const s = useMemo(
    () => ({
      label: { color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" as const },
      input: {
        color: c.foreground,
        fontSize: font.base,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.md,
        padding: space[2],
        backgroundColor: c.surface2,
      },
      note: { color: c.statusDanger, fontSize: font.sm },
      muted: { color: c.foregroundMuted, fontSize: font.sm },
    }),
    [c],
  );

  const applyPreset = useCallback((p: Preset) => {
    setType(p.type);
    setStrict(p.strict);
    setInstructions(p.instructions);
    setOptionsText(p.options.join("\n"));
    setNote(null);
  }, []);

  return (
    <View style={{ gap: space[2], padding: pad, backgroundColor: c.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border }}>
      <Text style={s.label}>presets (recipes)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {PRESETS.map((p) => (
          <Chip key={p.key} theme={theme} active={false} label={p.label} onPress={() => applyPreset(p)} />
        ))}
      </ScrollView>

      <Dropdown
        theme={theme}
        label="preferred model (optional)"
        items={[
          { key: "", label: "default" },
          ...models.map((m) => ({ key: m.id, label: m.label, hint: m.isDefault ? `${m.provider} · default` : m.provider })),
        ]}
        selectedKey={model}
        onSelect={setModel}
        placeholder="default"
      />
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

      <TextInput
        style={[s.input, { minHeight: 40 }]}
        placeholder="Description (optional) — context for you and the judge"
        placeholderTextColor={c.foregroundMuted}
        value={description}
        onChangeText={setDescription}
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

      <Button
        theme={theme}
        block
        icon={editing ? "Check" : "Plus"}
        disabled={!canAdd}
        busy={busy}
        onPress={onSubmit}
        label={busy ? (editing ? "Saving…" : "Adding…") : submitLabel ?? "Add judge task"}
      />
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}
