// v0.3.0: the judge. Model-agnostic via an injected JudgeBackend. `runJudge` = single task,
// multi-round STRICT. `runBatchJudge` = fan-out: many tasks over one shared state in ONE backend
// call (the jev efficiency lever). Pure/testable.
import {
  assemble,
  bandOf,
  normalizeDistribution,
  optionsOf,
  type Band,
  type Consideration,
  type Decision,
  type Option,
  type Question,
} from "../shared/contract";
import type { JudgeBackend } from "./backend";

export interface JudgeResult {
  model: string;
  type: Question["type"];
  instructions: string;
  options: Option[];
  strict: boolean;
  threshold: number;
  maxRounds: number;
  rounds: number;
  failStreak: number;
  verdict: "sufficient" | "insufficient" | "decided";
  decision: Decision;
  confidence: number;
  band: Band;
  reasoning: string;
  considerations?: Consideration[];
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const pct = (n: number): string => `${Math.round(clamp01(n) * 100)}%`;

function withFeedback(q: Question, feedback: string): Question {
  return { ...q, instructions: `${q.instructions}\n[Re-judge] ${feedback}` };
}

function resultOf(args: {
  question: Question;
  decision: Decision;
  model: string;
  strict: boolean;
  threshold: number;
  reviewFloor: number;
  maxRounds: number;
  rounds: number;
  failStreak: number;
  reasoning: string;
  considerations?: Consideration[];
  sufficient: boolean;
}): JudgeResult {
  const band = bandOf(args.decision.confidence, args.threshold, args.reviewFloor);
  const verdict = !args.strict ? "decided" : args.sufficient ? "sufficient" : "insufficient";
  return {
    model: args.model,
    type: args.question.type,
    instructions: args.question.instructions,
    options: optionsOf(args.question),
    strict: args.strict,
    threshold: args.threshold,
    maxRounds: args.maxRounds,
    rounds: args.rounds,
    failStreak: args.failStreak,
    verdict,
    decision: args.decision,
    confidence: args.decision.confidence,
    band,
    reasoning: args.reasoning,
    considerations: args.considerations,
  };
}

interface JudgeInput {
  question: Question;
  state: unknown;
  model: string;
  strict: boolean;
  threshold: number;
  reviewFloor: number;
  maxRounds: number;
  backend: JudgeBackend;
}

export async function runJudge(input: JudgeInput): Promise<JudgeResult> {
  const { question, state, model, strict, threshold, reviewFloor, backend } = input;
  const keys = optionsOf(question).map((o) => o.key);
  const maxRounds = strict ? Math.min(5, Math.max(1, Math.floor(input.maxRounds || 1))) : 1;

  let rounds = 0;
  let failStreak = 0;
  let sufficient = false;
  let feedback: string | undefined;
  let decision = assemble(question, normalizeDistribution({}, keys));
  let reasoning = "";
  let considerations: Consideration[] | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    const q = feedback ? withFeedback(question, feedback) : question;
    const answers = await backend.evaluate(state, { main: q });
    const raw = answers.main ?? { probabilities: {} };
    decision = assemble(question, normalizeDistribution(raw.probabilities, keys));
    reasoning = raw.reasoning ?? "";
    considerations = raw.considerations;
    rounds = round;
    sufficient = !strict || decision.confidence >= threshold;
    if (sufficient) break;
    failStreak++;
    feedback = `Round ${round} was ${pct(decision.confidence)} confident (< ${pct(
      threshold,
    )}). Re-examine ONLY the STATE; keep confidence low unless the evidence genuinely supports one option.`;
  }

  return resultOf({
    question,
    decision,
    model,
    strict,
    threshold,
    reviewFloor,
    maxRounds,
    rounds,
    failStreak,
    reasoning,
    considerations,
    sufficient,
  });
}

export interface BatchTask {
  id: string;
  question: Question;
}

interface BatchInput {
  tasks: BatchTask[];
  state: unknown;
  model: string;
  strict: boolean;
  threshold: number;
  reviewFloor: number;
  backend: JudgeBackend;
}

/** Fan-out: one backend call answers every task's question over the shared state. Single round. */
export async function runBatchJudge(input: BatchInput): Promise<Record<string, JudgeResult>> {
  const { tasks, state, model, strict, threshold, reviewFloor, backend } = input;
  const questions: Record<string, Question> = {};
  const uniqueTasks: BatchTask[] = [];
  for (const t of tasks) {
    if (t.id in questions) continue; // first occurrence wins; ignore duplicate ids
    questions[t.id] = t.question;
    uniqueTasks.push(t);
  }
  const answers = await backend.evaluate(state, questions);

  const out: Record<string, JudgeResult> = {};
  for (const t of uniqueTasks) {
    const keys = optionsOf(t.question).map((o) => o.key);
    const raw = answers[t.id] ?? { probabilities: {} };
    const decision = assemble(t.question, normalizeDistribution(raw.probabilities, keys));
    const sufficient = !strict || decision.confidence >= threshold;
    out[t.id] = resultOf({
      question: t.question,
      decision,
      model,
      strict,
      threshold,
      reviewFloor,
      maxRounds: 1,
      rounds: 1,
      failStreak: sufficient ? 0 : 1,
      reasoning: raw.reasoning ?? "",
      considerations: raw.considerations,
      sufficient,
    });
  }
  return out;
}
