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
  optionsOf,
  tallyVotes,
  type Consideration,
  type Question,
} from "../shared/contract";
import { extractJson } from "../shared/model-json";

/** Raw (un-normalized) probabilities for one question; the judge normalizes + assembles. */
export interface RawAnswer {
  probabilities: Record<string, number>;
  reasoning?: string;
  /** The model's self-posed Q&A explaining the call, surfaced in the card detail. */
  considerations?: Consideration[];
}

/** Keep only well-formed {q,a} pairs the model returned; cap so a card can't be flooded. */
function coerceConsiderations(v: unknown): Consideration[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Consideration[] = [];
  for (const x of v) {
    if (x && typeof x === "object" && typeof (x as Consideration).q === "string" && typeof (x as Consideration).a === "string") {
      out.push({ q: (x as Consideration).q, a: (x as Consideration).a });
    }
    if (out.length >= 6) break;
  }
  return out.length ? out : undefined;
}

export interface JudgeBackend {
  evaluate(state: unknown, questions: Record<string, Question>): Promise<Record<string, RawAnswer>>;
}

/** The raw model call: prompt + JSON schema in, reply text out. */
export type AskFn = (args: { system: string; prompt: string; schema: Record<string, unknown> }) => Promise<string>;

/**
 * `samples <= 1`: one call, the model self-reports a distribution (fast, cheap, less calibrated).
 * `samples  > 1`: K independent votes → empirical distribution (calibrated, K× the cost) — the
 * self-consistency technique that reproduces jev's calibrated output from a generic model.
 */
export function makeLlmBackend(ask: AskFn, samples = 1): JudgeBackend {
  const k = Math.max(1, Math.min(9, Math.floor(samples || 1)));
  return {
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
            considerations: coerceConsiderations(a.considerations),
          };
        }
        return out;
      }

      // Self-consistency: K parallel votes, then tally. This only spreads probability if the
      // provider samples (temperature > 0) — Claude Code / Codex do by default. Paseo has no
      // model-agnostic temperature knob (agents.create only takes provider-validated `options`, and
      // an unknown key can be rejected), so we don't force one: on a deterministic provider all K
      // votes match and confidence collapses to 0/1. Documented on the `samples` setting.
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
      for (const id of Object.keys(questions)) {
        const dist = probs[id] ?? {};
        const entries = Object.entries(dist);
        // The vote path returns only choices (no per-vote prose), so summarize the tally as the
        // reasoning: which option led and how strongly the K votes agreed.
        let reasoning: string | undefined;
        if (entries.length) {
          const [winKey, winShare] = entries.reduce((best, e) => (e[1] > best[1] ? e : best));
          const label = optionsOf(questions[id]).find((o) => o.key === winKey)?.label ?? winKey;
          reasoning = `Sampled ${k} times; "${label}" led with ${Math.round(winShare * 100)}% agreement across votes.`;
        }
        out[id] = { probabilities: dist, reasoning };
      }
      return out;
    },
  };
}
