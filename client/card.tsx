// v0.1.0: the in-session decision card. Render-only; mirrors the plan-step card UX — verdict,
// chosen answer, per-option probability bars, STRICT badge, rounds/fail-streak, confidence, model.
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { DecisionCard } from "../shared/card";
import { font, iconSize, radius, space, weight } from "./theme";

const VERDICT_ICON: Record<DecisionCard["verdict"], string> = {
  sufficient: "Scale",
  insufficient: "TriangleAlert",
  decided: "Scale",
  error: "TriangleAlert",
};

function pct(n: number): string {
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
}

/** The timeline renderer: unwrap the plugin item and draw the shared card body. */
export function JevDecisionCard({ item, theme }: PluginTimelineItemProps<DecisionCard>) {
  return <DecisionCardView theme={theme} card={item.data} />;
}

/** The card body, reused by the timeline renderer and the queue's resolved-row expansion. */
export function DecisionCardView({ theme, card }: { theme: PluginTheme; card: DecisionCard }) {
  const c = theme.colors;
  const d = card;
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
        gap: space[2],
        borderWidth: 1,
        borderColor: c.border,
        borderLeftWidth: 3,
        borderLeftColor: verdictColor,
        borderRadius: radius.lg,
        padding: space[3],
        backgroundColor: c.surface1,
      },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: space[2] },
      title: { color: c.foreground, fontWeight: weight.semibold, fontSize: font.base, flex: 1 },
      badge: {
        color: c.accentForeground,
        backgroundColor: c.accent,
        fontSize: font.sm,
        fontWeight: weight.semibold,
        paddingHorizontal: space[1.5],
        paddingVertical: 2,
        borderRadius: radius.full,
        overflow: "hidden" as const,
      },
      answer: { color: verdictColor, fontSize: font.lg, fontWeight: weight.bold },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: space[2] },
      optLabel: { color: c.foreground, fontSize: font.base, flex: 1 },
      optPct: { color: c.foregroundMuted, fontSize: font.sm, width: 44, textAlign: "right" as const },
      track: { height: 6, borderRadius: radius.full, backgroundColor: c.surface2, overflow: "hidden" as const },
      footer: { color: c.foregroundMuted, fontSize: font.sm },
      model: { color: c.foregroundMuted, fontSize: font.sm },
      why: { color: c.accent, fontSize: font.sm },
      reasoning: { color: c.foregroundMuted, fontSize: font.sm },
      note: { color: c.statusDanger, fontSize: font.sm },
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

      {d.description ? <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{d.description}</Text> : null}

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

      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
        <Icon name={VERDICT_ICON[d.verdict]} size={iconSize.xs} color={verdictColor} />
        <Text style={s.footer}>
          {d.verdict} · round {d.rounds}/{d.maxRounds} · fail-streak {d.failStreak}/{d.maxRounds} · {pct(d.confidence)}
          {d.strict ? ` · threshold ${pct(d.threshold)}` : ""}
        </Text>
      </View>
      {d.decidedBy === "user" ? (
        <Text style={s.model}>decided by you</Text>
      ) : d.model ? (
        <Text style={s.model}>model: {d.model}</Text>
      ) : null}

      {d.note ? <Text style={s.note}>{d.note}</Text> : null}

      {d.rationale?.length || d.reasoning ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showWhy }}
            hitSlop={6}
            onPress={() => setShowWhy((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}
          >
            <Icon name={showWhy ? "ChevronDown" : "ChevronRight"} size={iconSize.sm} color={c.accent} />
            <Text style={s.why}>{showWhy ? "hide reasoning" : "why? · context"}</Text>
          </Pressable>
          {showWhy ? (
            <View style={{ gap: space[2], paddingLeft: space[1] }}>
              {d.rationale?.map((r, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text style={{ color: c.foreground, fontSize: font.sm, fontWeight: weight.semibold }}>{r.q}</Text>
                  <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{r.a}</Text>
                </View>
              ))}
              {d.reasoning ? (
                <Text style={[s.reasoning, d.rationale?.length ? { fontStyle: "italic" } : null]}>{d.reasoning}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
