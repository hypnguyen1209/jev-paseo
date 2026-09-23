// v0.2.0: tiny shared UI atoms for the jev surfaces.
import { Pressable, Text } from "react-native";
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
