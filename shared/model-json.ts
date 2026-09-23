// v0.1.0: pull the single JSON object out of a model reply. Even with an outputSchema some
// providers wrap the answer in prose or a ```json fence, so parse defensively and never throw.

export function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const candidates: string[] = [];

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) candidates.push(fence[1].trim());

  candidates.push(text.trim());

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const v: unknown = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
