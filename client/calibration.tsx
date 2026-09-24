// v0.6.0: a lightweight calibration view drawn from the decision log's fold. No chart lib — just
// bars and a recent-decisions strip, styled with the shared tokens. Expanded from the queue's stats.
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { JevStats } from "./use-jev";
import { font, radius, space, weight } from "./theme";

const HIST_LABELS = ["0–20", "20–40", "40–60", "60–80", "80–100"];

function bandColor(band: "high" | "medium" | "low" | null, c: PluginTheme["colors"]): string {
  if (band === "high") return c.statusSuccess;
  if (band === "medium") return c.statusWarning;
  if (band === "low") return c.statusDanger;
  return c.foregroundMuted;
}

function StatBar({
  theme,
  label,
  frac,
  right,
  color,
}: {
  theme: PluginTheme;
  label: string;
  frac: number;
  right?: string;
  color?: string;
}) {
  const c = theme.colors;
  const w = Math.round(Math.min(1, Math.max(0, frac)) * 100);
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={right ? `${label}: ${right}` : `${label}: ${w}%`}>
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {right ? <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{right}</Text> : null}
      </View>
      <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.surface2, overflow: "hidden" }}>
        <View style={{ height: 6, borderRadius: radius.full, width: `${w}%`, backgroundColor: color ?? c.accent }} />
      </View>
    </View>
  );
}

export function CalibrationView({ theme, stats }: { theme: PluginTheme; stats: JevStats }) {
  const c = theme.colors;
  if (stats.total === 0) {
    return <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>No decisions logged yet.</Text>;
  }
  const label = { color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" as const };
  const histMax = Math.max(1, ...stats.histogram);
  const bandDen = Math.max(1, stats.byModel);
  return (
    <View
      style={{
        gap: space[3],
        padding: space[3],
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.lg,
        backgroundColor: c.surface1,
      }}
    >
      <Text style={{ color: c.foreground, fontWeight: weight.semibold, fontSize: font.base }}>Calibration</Text>

      {stats.agreementRate !== null ? (
        <StatBar
          theme={theme}
          label="you agree with the model"
          frac={stats.agreementRate}
          right={`${Math.round(stats.agreementRate * 100)}% of ${stats.compared}`}
          color={c.statusSuccess}
        />
      ) : null}
      {stats.byModel > 0 ? (
        <StatBar
          theme={theme}
          label="mean model confidence"
          frac={stats.meanConfidence}
          right={`${Math.round(stats.meanConfidence * 100)}%`}
        />
      ) : null}

      {stats.byModel > 0 ? (
        <View style={{ gap: space[1] }}>
          <Text style={label}>model confidence distribution</Text>
          {stats.histogram.map((n, i) => (
            <StatBar key={i} theme={theme} label={`${HIST_LABELS[i]}%`} frac={n / histMax} right={String(n)} />
          ))}
        </View>
      ) : null}

      {stats.byModel > 0 ? (
        <View style={{ gap: space[1] }}>
          <Text style={label}>bands</Text>
          <StatBar theme={theme} label="high" frac={stats.bands.high / bandDen} right={String(stats.bands.high)} color={c.statusSuccess} />
          <StatBar theme={theme} label="medium" frac={stats.bands.medium / bandDen} right={String(stats.bands.medium)} color={c.statusWarning} />
          <StatBar theme={theme} label="low" frac={stats.bands.low / bandDen} right={String(stats.bands.low)} color={c.statusDanger} />
        </View>
      ) : null}

      {stats.recent.length ? (
        <View style={{ gap: space[1] }}>
          <Text style={label}>recent (newest last · faded = your pick)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {stats.recent.map((r, i) => (
              <View
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: bandColor(r.band, c),
                  opacity: r.decidedBy === "user" ? 0.45 : 1,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
