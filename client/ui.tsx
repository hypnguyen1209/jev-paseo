// v0.5.0: shared UI atoms, styled to match Paseo's native chrome — same tokens, the same menu-row
// look (hover = surface2, selection = a trailing check, not a fill), the same button geometry, and
// real lucide icons via the host's Icon component.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { controlHeight, font, iconSize, radius, space, weight } from "./theme";
import { withAlpha } from "./format";

type Hover = PressableStateCallbackType & { hovered?: boolean };

/**
 * A soft status pill (herald's reasonPill): a tinted rounded tag with an optional leading icon, in
 * one tone colour. The background is the tone at ~13% alpha; if the tone isn't a #RRGGBB colour (some
 * themes use rgb()), withAlpha passes it through unchanged, so fall back to surface2 to stay legible.
 */
export function Pill({
  theme,
  tone,
  label,
  icon,
}: {
  theme: PluginTheme;
  tone: string;
  label: string;
  icon?: string;
}) {
  const tint = withAlpha(tone, "22");
  const bg = tint === tone ? theme.colors.surface2 : tint;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        paddingHorizontal: space[1.5],
        paddingVertical: 2,
        borderRadius: radius.full,
        backgroundColor: bg,
      }}
    >
      {icon ? <Icon name={icon} size={iconSize.xs} color={tone} /> : null}
      <Text style={{ color: tone, fontSize: font.sm, fontWeight: weight.semibold }}>{label}</Text>
    </View>
  );
}

// Only one dropdown open at a time: opening one closes whichever was open (they render inline, so
// there's no backdrop to dismiss them otherwise).
let closeActiveDropdown: (() => void) | null = null;

export function Chip({
  theme,
  active,
  label,
  onPress,
  disabled,
}: {
  theme: PluginTheme;
  active: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: Hover) => ({
        borderWidth: 1,
        borderColor: active ? c.accent : c.border,
        backgroundColor: active ? c.accent : hovered || pressed ? c.surface2 : c.surface1,
        borderRadius: radius.full,
        paddingHorizontal: space[2] + 2,
        paddingVertical: space[1],
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ color: active ? c.accentForeground : c.foreground, fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );
}

type ButtonVariant = "default" | "secondary" | "ghost";

/** A button with Paseo's geometry: radius lg, 32pt tall, accent fill, press dims to 0.85. */
export function Button({
  theme,
  label,
  onPress,
  variant = "default",
  icon,
  disabled,
  busy,
  block,
}: {
  theme: PluginTheme;
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: string;
  disabled?: boolean;
  busy?: boolean;
  block?: boolean;
}) {
  const c = theme.colors;
  const off = disabled || busy;
  const fg =
    variant === "default" ? c.accentForeground : variant === "ghost" ? c.foregroundMuted : c.foreground;
  const bg = variant === "default" ? c.accent : variant === "secondary" ? c.surface2 : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed, hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space[2],
        minHeight: controlHeight.compact,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: variant === "default" ? c.accent : variant === "secondary" ? c.surface2 : "transparent",
        backgroundColor: variant === "ghost" && (hovered || pressed) ? c.surface2 : bg,
        opacity: off ? 0.5 : pressed ? 0.85 : 1,
        alignSelf: block ? "stretch" : "flex-start",
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={iconSize.sm} color={fg} />
      ) : null}
      <Text style={{ color: fg, fontSize: font.base, fontWeight: weight.medium }}>{label}</Text>
    </Pressable>
  );
}

interface DropdownItem {
  key: string;
  label: string;
  /** Muted trailing tag, e.g. the provider / agent harness behind a model. */
  hint?: string;
}

/**
 * A select-style dropdown modeled on Paseo's menu: a bordered trigger with a chevron, then an inset
 * list of rows. Hover fills a row (surface2); the chosen row is marked by a trailing check, not a
 * fill (a checked row that is also filled reads as two claims about the same state).
 */
export function Dropdown({
  theme,
  label,
  items,
  selectedKey,
  onSelect,
  placeholder,
}: {
  theme: PluginTheme;
  label: string;
  items: DropdownItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  placeholder?: string;
}) {
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.key === selectedKey);
  const close = useCallback(() => {
    setOpen(false);
    if (closeActiveDropdown === close) closeActiveDropdown = null;
  }, []);
  const toggle = useCallback(() => {
    setOpen((v) => {
      if (v) {
        if (closeActiveDropdown === close) closeActiveDropdown = null;
        return false;
      }
      if (closeActiveDropdown && closeActiveDropdown !== close) closeActiveDropdown();
      closeActiveDropdown = close;
      return true;
    });
  }, [close]);
  useEffect(() => () => {
    if (closeActiveDropdown === close) closeActiveDropdown = null;
  }, [close]);
  return (
    <View style={{ gap: space[1] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed, hovered }: Hover) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space[2],
          minHeight: controlHeight.compact,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: hovered || pressed ? c.surface2 : c.surface1,
          borderRadius: radius.lg,
          paddingHorizontal: space[3],
          paddingVertical: space[1],
        })}
      >
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm, textTransform: "uppercase" }}>{label}</Text>
        <Text style={{ color: c.foreground, fontWeight: weight.semibold, flex: 1 }} numberOfLines={1}>
          {selected?.label ?? placeholder ?? "—"}
        </Text>
        {selected?.hint ? <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{selected.hint}</Text> : null}
        <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{items.length}</Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={iconSize.sm} color={c.foregroundMuted} />
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, backgroundColor: c.surface1, overflow: "hidden", paddingVertical: space[1] }}>
          <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
            {items.map((it) => {
              const active = it.key === selectedKey;
              return (
                <Pressable
                  key={it.key}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(it.key);
                    close();
                  }}
                  style={({ pressed, hovered }: Hover) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space[2],
                    minHeight: controlHeight.compact,
                    marginHorizontal: space[1],
                    paddingHorizontal: space[2],
                    paddingVertical: space[1],
                    borderRadius: radius.md,
                    backgroundColor: hovered || pressed ? c.surface2 : "transparent",
                  })}
                >
                  <Text
                    style={{ color: c.foreground, fontSize: font.base, fontWeight: active ? weight.semibold : "normal", flex: 1 }}
                    numberOfLines={1}
                  >
                    {it.label}
                  </Text>
                  {it.hint ? <Text style={{ color: c.foregroundMuted, fontSize: font.sm }}>{it.hint}</Text> : null}
                  <View style={{ width: iconSize.md, alignItems: "center" }}>
                    {active ? <Icon name="Check" size={iconSize.md} color={c.foreground} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
