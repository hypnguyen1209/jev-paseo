---
name: jev-decision
description: Offload a small, high-stakes typed decision to the jev Paseo plugin by emitting a [jev] marker line. Use when a choice, a yes/no gate, or a risk level should be decided by the user (or a model they pick) rather than guessed.
---

## jev decisions

This project runs on Paseo with the **jev** plugin. To hand off a small, high-stakes decision instead of guessing, write ONE marker on its own line, at the start of the line:

```
[jev] <type> [strict]: <question> [| option | option ...]
```

- `type`: `choice` (one of N options), `score` (a level low-to-high), or `yn` (yes/no).
- `strict` (optional): re-ask until confidence clears the threshold, else return "insufficient".
- `choice` and `score` need at least two `|`-separated options; `yn` takes none.

```
[jev] choice: Which fix is safer? | rollback | hotfix
[jev] yn strict: Did the failing test pass?
[jev] score: Rate this diff's risk | trivial | low | medium | high | severe
```

Use it for a costly choice, a yes/no gate you should not decide alone, or a risk level. Not for trivia or things you can verify yourself, and at most once or twice per turn. State the evidence in your message first (jev judges from the recent session text), emit the marker last before you end the turn, then stop and wait. With `JEV_FEEDBACK=1` the verdict returns as a `[jev] Decision on "...": ...` message to continue from; otherwise the user resolves it in the Jev panel.

When a verdict comes back, act on it. Do not re-ask the same question, rephrased or otherwise. If the verdict says low confidence or "insufficient", the evidence was not there: ask the user, do not ask the judge again. jev enforces this mechanically (at most 5 markers per turn are queued, and past 10 marker tasks in an hour new ones wait for the user), so a question loop stalls instead of burning calls.
