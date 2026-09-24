// v0.6.0: browser-only file download. The tsconfig lib excludes DOM (the plugin also runs on RN), so
// reach the DOM globals through a typed globalThis cast and gate on their presence: on native they're
// absent and this returns false, where the caller falls back to a toast.
interface DomBits {
  document?: { createElement(tag: string): { href: string; download: string; click(): void } };
  Blob?: new (parts: unknown[], opts: { type: string }) => unknown;
  URL?: { createObjectURL(o: unknown): string; revokeObjectURL(u: string): void };
}

export function downloadCsv(filename: string, csv: string): boolean {
  const g = globalThis as unknown as DomBits;
  if (!g.document || !g.Blob || !g.URL || typeof g.URL.createObjectURL !== "function") return false;
  // Prepend a BOM so Excel opens UTF-8 correctly.
  const url = g.URL.createObjectURL(new g.Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const link = g.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => g.URL?.revokeObjectURL(url), 1000);
  return true;
}
