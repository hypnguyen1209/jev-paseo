// v0.7.0: the judge backend — a general LLM, no dependency on any hosted decision model.
// It reproduces jev's approach two ways: (1) a schema-constrained typed answer (no out-of-enum), and
// (2) OPTIONAL self-consistency — sample the model K times and tally votes into a calibrated empirical
// distribution, instead of trusting one self-reported probability. Transport (`ask`) is injected.
import {
  buildBatchPrompt,
  buildBatchSchema,
  buildVotePrompt,
  buildVoteSchema,
  JUDGE_SYSTEM_PROMPT,
  tallyVotes,
  type Question,
} from "../shared/contract";
import { extractJson } from "../shared/model-json";

/** Raw (un-normalized) probabilities for one question; the judge normalizes + assembles. */
export interface RawAnswer {
  probabilities: Record<string, number>;
  reasoning?: string;
}

export interface JudgeBackend {
  label: string;
  multiRound: boolean;
  evaluate(state: unknown, questions: Record<string, Question>): Promise<Record<string, RawAnswer>>;
}

/** The raw model call: prompt + JSON schema in, reply text out. */
export type AskFn = (args: { system: string; prompt: string; schema: Record<string, unknown> }) => Promise<string>;

/**
 * `samples <= 1`: one call, the model self-reports a distribution (fast, cheap, less calibrated).
 * `samples  > 1`: K independent votes → empirical distribution (calibrated, K× the cost) — the
 * self-consistency technique that reproduces jev's calibrated output from a generic model.
 */
export function makeLlmBackend(model: string, ask: AskFn, samples = 1): JudgeBackend {
  const k = Math.max(1, Math.min(9, Math.floor(samples || 1)));
  return {
    label: k > 1 ? `${model} · ${k}× self-consistency` : model,
    multiRound: true,
    async evaluate(state, questions) {
      if (k <= 1) {
        const text = await ask({
          system: JUDGE_SYSTEM_PROMPT,
          prompt: buildBatchPrompt(state, questions),
          schema: buildBatchSchema(questions),
        });
        const raw = extractJson(text) ?? {};
        const answers = (raw.answers as Record<string, Record<string, unknown>> | undefined) ?? {};
        const out: Record<string, RawAnswer> = {};
        for (const id of Object.keys(questions)) {
          const a = answers[id] ?? {};
          const probs = a.probabilities;
          out[id] = {
            probabilities: probs && typeof probs === "object" && !Array.isArray(probs) ? (probs as Record<string, number>) : {},
            reasoning: typeof a.reasoning === "string" ? a.reasoning : undefined,
          };
        }
        return out;
      }

      // self-consistency: K parallel votes, then tally
      const prompt = buildVotePrompt(state, questions);
      const schema = buildVoteSchema(questions);
      const texts = await Promise.all(
        Array.from({ length: k }, () => ask({ system: JUDGE_SYSTEM_PROMPT, prompt, schema })),
      );
      const votes = texts.map((t) => {
        const raw = extractJson(t) ?? {};
        return (raw.answers as Record<string, { choice?: unknown }> | undefined) ?? {};
      });
      const probs = tallyVotes(votes, questions);
      const out: Record<string, RawAnswer> = {};
      for (const id of Object.keys(questions)) out[id] = { probabilities: probs[id] ?? {} };
      return out;
    },
  };
}
