// v0.6.0: tiny pure formatters shared by the UI (learned from herald). No React/RN, so unit-testable.

/** Append an alpha byte (e.g. "22") to a #RRGGBB colour for a soft tint; pass non-hex through as-is. */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : color;
}

/** "just now" / "N min ago" / "N h ago" / "yesterday" / "N days ago" from an ISO timestamp. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
