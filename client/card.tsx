// v0.1.0: the in-session decision card. Render-only; mirrors the plan-step card UX — verdict,
// chosen answer, per-option probability bars, STRICT badge, rounds/fail-streak, confidence, model.
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DecisionCard } from "../shared/card";

const VERDICT_GLYPH: Record<DecisionCard["verdict"], string> = {
  sufficient: "⚖ sufficient",
  insufficient: "⚖ insufficient",
  decided: "⚖ decided",
  error: "⚠ error",
};

function pct(n: number): string {
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
}

export function JevDecisionCard({ item, theme }: PluginTimelineItemProps<DecisionCard>) {
  const c = theme.colors;
  const d = item.data;
  const [showWhy, setShowWhy] = useState(false);

  const verdictColor =
    d.verdict === "sufficient"
      ? c.statusSuccess
      : d.verdict === "insufficient"
        ? c.statusWarning
        : d.verdict === "error"
          ? c.statusDanger
          : c.accent;

  const bandColor =
    d.band === "high" ? c.statusSuccess : d.band === "medium" ? c.statusWarning : c.statusDanger;

  const maxProb = useMemo(() => d.options.reduce((m, o) => Math.max(m, o.prob), 0), [d.options]);

  const s = useMemo(
    () => ({
      card: {
        gap: 8,
        borderWidth: 1,
        borderColor: c.border,
        borderLeftWidth: 3,
        borderLeftColor: verdictColor,
        borderRadius: 10,
        padding: 12,
        backgroundColor: c.surface1,
      },
      header: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 8 },
      title: { color: c.foreground, fontWeight: "600" as const, flex: 1 },
      badge: {
        color: c.accentForeground,
        backgroundColor: c.accent,
        fontSize: 10,
        fontWeight: "700" as const,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        overflow: "hidden" as const,
      },
      answer: { color: verdictColor, fontSize: 16, fontWeight: "700" as const },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      optLabel: { color: c.foreground, flex: 1 },
      optPct: { color: c.foregroundMuted, width: 44, textAlign: "right" as const },
      track: { height: 6, borderRadius: 999, backgroundColor: c.surface2, overflow: "hidden" as const },
      footer: { color: c.foregroundMuted, fontSize: 11 },
      model: { color: c.foregroundMuted, fontSize: 11 },
      why: { color: c.accent, fontSize: 12 },
      reasoning: { color: c.foregroundMuted, fontSize: 12 },
      note: { color: c.statusDanger, fontSize: 12 },
    }),
    [c, verdictColor],
  );

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>{d.instructions}</Text>
        {d.band && d.verdict !== "error" ? (
          <Text style={[s.badge, { backgroundColor: bandColor, color: c.surface0 }]}>{d.band}</Text>
        ) : null}
        {d.strict ? <Text style={s.badge}>STRICT</Text> : null}
        {d.shadow ? (
          <Text style={[s.badge, { backgroundColor: c.surface2, color: c.foregroundMuted }]}>shadow</Text>
        ) : null}
      </View>

      {d.verdict !== "error" ? <Text style={s.answer}>{d.answerLabel}</Text> : null}

      {d.options.map((o) => (
        <View key={o.key} style={{ gap: 3 }}>
          <View style={s.row}>
            <Text style={[s.optLabel, o.prob === maxProb ? { fontWeight: "700" } : null]}>{o.label}</Text>
            <Text style={s.optPct}>{pct(o.prob)}</Text>
          </View>
          <View style={s.track}>
            <View
              style={{
                height: 6,
                borderRadius: 999,
                width: `${Math.round(Math.min(1, Math.max(0, o.prob)) * 100)}%`,
                backgroundColor: o.prob === maxProb ? verdictColor : c.foregroundMuted,
              }}
            />
          </View>
        </View>
      ))}

      <Text style={s.footer}>
        {VERDICT_GLYPH[d.verdict]} · round {d.rounds}/{d.maxRounds} · fail-streak {d.failStreak}/{d.maxRounds} ·{" "}
        {pct(d.confidence)}
        {d.strict ? ` · threshold ${pct(d.threshold)}` : ""}
      </Text>
      {d.decidedBy === "user" ? (
        <Text style={s.model}>decided by you</Text>
      ) : d.model ? (
        <Text style={s.model}>model: {d.model}</Text>
      ) : null}

      {d.note ? <Text style={s.note}>{d.note}</Text> : null}

      {d.reasoning ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setShowWhy((v) => !v)}>
            <Text style={s.why}>{showWhy ? "hide reasoning" : "why?"}</Text>
          </Pressable>
          {showWhy ? <Text style={s.reasoning}>{d.reasoning}</Text> : null}
        </>
      ) : null}
    </View>
  );
}
