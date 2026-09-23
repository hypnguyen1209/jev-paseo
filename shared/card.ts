// v0.1.0: the data contract for the in-session decision card. Shared by the RPC output and the
// timeline renderer so the client validates exactly what the server emits.
import { z } from "zod";

export const JEV_DECISION_KIND = "jev-decision";
export const JEV_DECISION_VERSION = 1;

export const DecisionCardSchema = z.object({
  instructions: z.string(),
  type: z.enum(["noul", "choice", "score"]),
  model: z.string(),
  strict: z.boolean(),
  threshold: z.number(),
  verdict: z.enum(["sufficient", "insufficient", "decided", "error"]),
  rounds: z.number(),
  maxRounds: z.number(),
  failStreak: z.number(),
  confidence: z.number(),
  /** action band from confidence: high→auto, medium→confirm/review, low→escalate. */
  band: z.enum(["high", "medium", "low"]).optional(),
  /** Human-readable answer, e.g. "rollback · 90%", "yes · 98%", "3.4 — good". */
  answerLabel: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string(), prob: z.number() })),
  reasoning: z.string(),
  /** The judge's self-posed questions and answers — the "why", made legible in the card detail. */
  rationale: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  note: z.string().optional(),
  /** who made the call: the user (manual pick) or the chosen model (LLM judge). */
  decidedBy: z.enum(["user", "model"]).optional(),
  /** shadow judgment: shown + logged but the task was left pending. */
  shadow: z.boolean().optional(),
  createdAt: z.string(),
});

export type DecisionCard = z.infer<typeof DecisionCardSchema>;
