// v0.1.0: pure mapping between a parsed request / judge result and the in-session card.
// Shared by the judge-task handlers and the demo harness so both exercise the same real code.
import type { DecisionCard } from "../shared/card";
import { optionsOf, type Question } from "../shared/contract";
import type { JudgeResult } from "./judge";

const pct = (n: number): string => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

/** Build a typed Question from the flat request fields, or null if options are insufficient. */
export function buildQuestion(
  type: "noul" | "choice" | "score",
  instructions: string,
  options: string[],
): Question | null {
  if (type === "noul") return { type: "noul", instructions };
  if (options.length < 2) return null;
  if (type === "score") return { type: "score", instructions, criteria: options };
  const criteria: Record<string, string> = {};
  options.forEach((label, i) => (criteria[`o${i}`] = label));
  return { type: "choice", instructions, criteria };
}

export function answerLabel(r: JudgeResult): string {
  const d = r.decision;
  if (d.type === "choice") {
    const opt = r.options.find((o) => o.key === d.choice);
    return `${opt?.label ?? d.choice} · ${pct(d.probabilities[d.choice] ?? 0)}`;
  }
  if (d.type === "noul") {
    return d.noul >= 0.5 ? `yes · ${pct(d.noul)}` : `no · ${pct(1 - d.noul)}`;
  }
  const near = String(Math.round(d.score));
  return `${d.score.toFixed(1)} — ${d.legend[near] ?? near}`;
}

export function toCard(r: JudgeResult): DecisionCard {
  return {
    instructions: r.instructions,
    type: r.type,
    model: r.model,
    strict: r.strict,
    threshold: r.threshold,
    verdict: r.verdict,
    rounds: r.rounds,
    maxRounds: r.maxRounds,
    failStreak: r.failStreak,
    confidence: r.confidence,
    band: r.band,
    answerLabel: answerLabel(r),
    options: r.options.map((o) => ({ key: o.key, label: o.label, prob: r.decision.probabilities[o.key] ?? 0 })),
    reasoning: r.reasoning,
    rationale: r.considerations,
    decidedBy: "model",
    createdAt: new Date().toISOString(),
  };
}

/** Build a resolved card for a manual (user) pick — the chosen option gets probability 1. */
export function userCard(
  type: "noul" | "choice" | "score",
  instructions: string,
  options: string[],
  choiceKey: string,
): DecisionCard {
  const q = buildQuestion(type, instructions, options);
  const opts = q ? optionsOf(q) : [];
  const chosen = opts.find((o) => o.key === choiceKey);
  return {
    instructions,
    type,
    model: "",
    strict: false,
    threshold: 0,
    verdict: "decided",
    rounds: 0,
    maxRounds: 0,
    failStreak: 0,
    confidence: 1,
    band: "high",
    answerLabel: chosen ? `${chosen.label} · 100%` : choiceKey,
    options: opts.map((o) => ({ key: o.key, label: o.label, prob: o.key === choiceKey ? 1 : 0 })),
    reasoning: "",
    decidedBy: "user",
    createdAt: new Date().toISOString(),
  };
}
