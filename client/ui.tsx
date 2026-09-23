// v0.5.0: tiny shared UI atoms for the jev surfaces: a chip and a scrollable dropdown.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";

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
      style={{
        borderWidth: 1,
        borderColor: active ? c.accent : c.border,
        backgroundColor: active ? c.accent : c.surface2,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: active ? c.accentForeground : c.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export interface DropdownItem {
  key: string;
  label: string;
  /** Muted trailing tag, e.g. the provider / agent harness behind a model. */
  hint?: string;
}

/**
 * A select-style dropdown: a trigger row plus a vertical, scrollable list. Picked over a row of
 * chips because a narrow pane can't scroll a chip row and a long list (many models) would either
 * clip or fill the screen when wrapped.
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
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface1,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: c.foregroundMuted, fontSize: 11, textTransform: "uppercase" }}>{label}</Text>
        <Text style={{ color: c.foreground, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {selected?.label ?? placeholder ?? "—"}
        </Text>
        {selected?.hint ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{selected.hint}</Text> : null}
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{items.length}</Text>
        <Text style={{ color: c.foregroundMuted }}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface1, overflow: "hidden" }}>
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
            {items.map((it, i) => {
              const active = it.key === selectedKey;
              return (
                <Pressable
                  key={it.key}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(it.key);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: active ? c.surface2 : "transparent",
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderColor: c.border,
                  }}
                >
                  <Text
                    style={{ color: active ? c.foreground : c.foregroundMuted, fontWeight: active ? "700" : "400", flex: 1 }}
                    numberOfLines={1}
                  >
                    {active ? "● " : ""}
                    {it.label}
                  </Text>
                  {it.hint ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{it.hint}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
