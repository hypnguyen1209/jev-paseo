// Runnable demo (no Paseo daemon) of jev-paseo v0.3: the real judge pipeline with the backend seam.
// Shows: (1) single multi-round STRICT judge, (2) FAN-OUT — many tasks resolved in ONE backend call,
// (3) K-vote self-consistency, (4) a user (manual) resolution, all with bands.
// Only the transport (the LLM `ask`) is faked; everything else is production code. npm run demo
import { runBatchJudge, runJudge, type BatchTask } from "../server/judge";
import { makeLlmBackend, type AskFn } from "../server/backend";
import { buildQuestion, toCard, userCard } from "../server/card-map";
import { aggregate, type DecisionLog } from "../server/log";
import { taskOptions } from "../shared/task";
import { PRESETS } from "../shared/presets";
import type { DecisionCard } from "../shared/card";

const q = (type: "noul" | "choice" | "score", instructions: string, options: string[] = []) =>
  buildQuestion(type, instructions, options)!;

const base = { model: "demo/model", strict: true, threshold: 0.9, reviewFloor: 0.6, maxRounds: 3 };

const bar = (p: number, w = 18) => "█".repeat(Math.round(p * w)) + "░".repeat(w - Math.round(p * w));
const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

function renderCard(card: DecisionCard): void {
  const max = card.options.reduce((m, o) => Math.max(m, o.prob), 0);
  const glyph =
    card.verdict === "sufficient" ? "⚖ sufficient" : card.verdict === "insufficient" ? "⚖ insufficient" : "⚖ decided";
  const by = card.decidedBy === "user" ? "by you" : card.model ? `by ${card.model}` : "";
  console.log("  ┌─ jev-decision ─────────────────────────────────────────────");
  console.log(`  │ Q: ${card.instructions}   [${card.band ?? "?"}]${card.strict ? " [STRICT]" : ""}`);
  console.log(`  │ ▸ ${card.answerLabel}   (${by})`);
  for (const o of card.options)
    console.log(`  │   ${o.prob === max ? "●" : " "} ${o.label.padEnd(10)} ${bar(o.prob)} ${pct(o.prob).padStart(4)}`);
  console.log(
    `  │ ${glyph} · round ${card.rounds}/${card.maxRounds} · fail-streak ${card.failStreak}/${card.maxRounds} · ${pct(
      card.confidence,
    )} · band ${card.band}`,
  );
  console.log("  └────────────────────────────────────────────────────────────");
}

/** A fake LLM backend: reads the batch schema's question ids, returns scripted probabilities. */
function llmBackend(perCall: Array<Record<string, Record<string, number>>>): ReturnType<typeof makeLlmBackend> & { calls: () => number } {
  let n = 0;
  const ask: AskFn = async ({ schema }) => {
    const ids = Object.keys(
      (schema as { properties: { answers: { properties: Record<string, unknown> } } }).properties.answers.properties,
    );
    const byId = perCall[Math.min(n, perCall.length - 1)];
    n++;
    const answers: Record<string, unknown> = {};
    for (const id of ids) answers[id] = { probabilities: byId[id] ?? {}, reasoning: "scripted" };
    return JSON.stringify({ answers });
  };
  return Object.assign(makeLlmBackend(ask), { calls: () => n });
}

async function main(): Promise<void> {
  console.log("=== jev-paseo v0.3 — real pipeline, faked transports ===");

  // 1) single task, STRICT multi-round (weak evidence → re-judge → strong on round 2)
  console.log("\n[1] single STRICT judge (multi-round)");
  const r1 = await runJudge({
    ...base,
    question: q("noul", "Did the failing test pass after the patch?"),
    state: "run log attached",
    backend: llmBackend([{ main: { no: 0.45, yes: 0.55 } }, { main: { no: 0.03, yes: 0.97 } }]),
  });
  renderCard(toCard(r1));

  // 2) FAN-OUT: four tasks answered in ONE backend call
  console.log("\n[2] fan-out: 4 tasks, ONE backend call");
  const tasks: BatchTask[] = [
    { id: "t1", question: q("choice", "Which fix is safer?", ["rollback", "hotfix"]) },
    { id: "t2", question: q("noul", "Did the test pass?") },
    { id: "t3", question: q("noul", "Is the login bug fully fixed?") },
    { id: "t4", question: q("score", "Rate this diff's risk", ["trivial", "low", "medium", "high", "severe"]) },
  ];
  const per: Record<string, Record<string, number>> = {
    t1: { o0: 0.9, o1: 0.1 },
    t2: { no: 0.03, yes: 0.97 },
    t3: { no: 0.5, yes: 0.5 },
    t4: { "0": 0.02, "1": 0.08, "2": 0.2, "3": 0.6, "4": 0.1 },
  };
  const batchBackend = llmBackend([per]);
  const results = await runBatchJudge({ ...base, tasks, state: "session evidence", backend: batchBackend });
  console.log(`  → ${batchBackend.calls()} backend call for ${tasks.length} tasks (fan-out)`);
  for (const t of tasks) renderCard(toCard(results[t.id]));

  // 3) self-consistency (jev's calibration technique): sample K times, tally votes → distribution
  console.log("\n[3] self-consistency — 5 votes tallied (no hosted model)");
  const votes = ["yes", "yes", "yes", "no", "yes"]; // 4 yes / 1 no → 80%
  let vi = 0;
  const voteAsk: AskFn = async () => JSON.stringify({ answers: { main: { choice: votes[vi++] } } });
  const r3 = await runJudge({
    ...base,
    strict: false,
    question: q("noul", "Is this change ready to ship?"),
    state: "evidence",
    model: "anthropic/claude-sonnet-5",
    backend: makeLlmBackend(voteAsk, 5),
  });
  renderCard(toCard(r3));

  // 4) manual (user) resolution
  console.log("\n[4] user resolution (tap 'rollback')");
  const choiceQ = { type: "choice" as const, instructions: "Which fix is safer?", options: ["rollback", "hotfix"] };
  renderCard(userCard(choiceQ.type, choiceQ.instructions, choiceQ.options, taskOptions(choiceQ)[0].key));

  // 5) presets (recipes) that pre-fill the "＋ new" form
  console.log("\n[5] presets (recipes):", PRESETS.map((p) => p.label).join("  "));

  // 6) calibration: shadow mode logs model + user decisions; aggregate computes regret (agreement)
  console.log("\n[6] calibration — aggregate over a decision log (shadow model + user picks)");
  const rec = (o: Partial<DecisionLog>): DecisionLog => ({
    taskId: "x", agentId: "a", type: "noul", instructions: "q", model: "demo/model",
    decidedBy: "model", verdict: "sufficient", band: "high", confidence: 0.94, chosen: "yes", shadow: true,
    createdAt: "2026-09-22", ...o,
  });
  const st = aggregate([
    rec({ taskId: "a", chosen: "yes", band: "high", confidence: 0.94 }),
    rec({ taskId: "a", decidedBy: "user", chosen: "yes", confidence: 1 }), // agree
    rec({ taskId: "b", chosen: "yes", band: "low", confidence: 0.1 }),
    rec({ taskId: "b", decidedBy: "user", chosen: "no", confidence: 1 }), // disagree
  ]);
  console.log(
    `  ${st.total} decisions · ${st.byModel} model / ${st.byUser} you · mean conf ${Math.round(
      st.meanConfidence * 100,
    )}% · bands H${st.bands.high}/M${st.bands.medium}/L${st.bands.low} · you-vs-model agree ${
      st.agreementRate !== null ? Math.round(st.agreementRate * 100) + "%" : "—"
    } (${st.compared} compared)`,
  );
}

void main();
