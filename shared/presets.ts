// v0.4.0: judge-task "recipes" — the common jev use cases seen across the ecosystem
// (verify=Canny/citation-check, route=codex-router/langchain, severity/guardrail=llm_guardrails,
// rerank=rerank_typesafe, keep=fast-jev-compaction/winnow). Each just pre-fills the new-task form.
export interface Preset {
  key: string;
  label: string;
  type: "noul" | "choice" | "score";
  instructions: string;
  options: string[];
  strict: boolean;
}

export const PRESETS: Preset[] = [
  {
    key: "verify",
    label: "✓ verify",
    type: "choice",
    instructions: "Given the session evidence, is the step/claim actually complete?",
    options: ["supports — clearly done", "contradicts — clearly not done", "not enough evidence"],
    strict: true,
  },
  {
    key: "route",
    label: "⇄ route",
    type: "choice",
    instructions: "Which model should handle the next step?",
    options: ["fast — lookups, extraction, localized edits", "powerful — architecture, high-stakes changes"],
    strict: false,
  },
  {
    key: "severity",
    label: "▲ severity",
    type: "score",
    instructions: "How severe is this issue?",
    options: ["cosmetic; no impact", "degraded; workaround exists", "blocking; no workaround"],
    strict: false,
  },
  {
    key: "guardrail",
    label: "⚠ guardrail",
    type: "noul",
    instructions: "Is this request risky or harmful and should be blocked?",
    options: [],
    strict: true,
  },
  {
    key: "rerank",
    label: "↕ relevant",
    type: "noul",
    instructions: "Is this candidate relevant to the current task?",
    options: [],
    strict: false,
  },
  {
    key: "keep",
    label: "⌦ keep?",
    type: "noul",
    instructions: "Does this still need to stay in context verbatim?",
    options: [],
    strict: false,
  },
];
