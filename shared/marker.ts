// v0.6.0: parse a jev "marker" an agent emits to push a decision to the plugin.
// Grammar:  [jev] <choice|score|yn> [strict][:] <question> [| option | option ...]
export interface JevMarker {
  type: "noul" | "choice" | "score";
  instructions: string;
  options: string[];
  strict: boolean;
}

const PREFIX = "[jev]";

const TYPE_ALIASES: Record<string, JevMarker["type"]> = {
  choice: "choice",
  pick: "choice",
  score: "score",
  rate: "score",
  yn: "noul",
  noul: "noul",
  bool: "noul",
  yesno: "noul",
};

/** Parse one line as a jev marker, or null if it isn't one / is malformed. */
export function parseMarker(line: string): JevMarker | null {
  let rest = line.trim();
  if (!rest.toLowerCase().startsWith(PREFIX)) return null;
  rest = rest.slice(PREFIX.length).trim();

  const firstSpace = rest.search(/\s/);
  const typeTok = (firstSpace === -1 ? rest : rest.slice(0, firstSpace)).toLowerCase().replace(/:$/, "");
  const type = TYPE_ALIASES[typeTok];
  if (!type) return null;

  rest = (firstSpace === -1 ? "" : rest.slice(firstSpace)).trim();
  let strict = false;
  const m = /^strict\b\s*/i.exec(rest);
  if (m) {
    strict = true;
    rest = rest.slice(m[0].length);
  }
  rest = rest.replace(/^:\s*/, "").trim(); // optional colon separator

  if (!rest) return null;
  const parts = rest.split("|").map((s) => s.trim());
  const instructions = parts[0];
  if (!instructions) return null;
  const options = parts.slice(1).filter((s) => s.length > 0);
  if ((type === "choice" || type === "score") && options.length < 2) return null;

  return { type, instructions, options, strict };
}

/** Find every jev marker across a block of text (one per line). */
export function extractMarkers(text: string): JevMarker[] {
  const out: JevMarker[] = [];
  for (const line of text.split("\n")) {
    const marker = parseMarker(line);
    if (marker) out.push(marker);
  }
  return out;
}
