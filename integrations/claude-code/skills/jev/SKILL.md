---
name: jev-decision
description: Offload a small, high-stakes typed decision to the jev Paseo plugin by emitting a [jev] marker line. Use when a choice, a yes/no gate, or a risk level should be decided by the user (or a model they pick) rather than guessed.
---

# Asking jev for a decision

jev is a Paseo plugin. Writing a `[jev]` marker line in your output turns it into a typed, calibrated decision task the user (or a model they choose) resolves. Use it to hand off a small, high-stakes call instead of guessing.

## When

- A choice between a few concrete options where a wrong pick is costly (which fix to ship, roll back or hotfix).
- A yes/no gate you should not decide alone (did the failing test actually pass? safe to run this?).
- A risk or quality level on an ordered scale.

Skip it for trivia, for anything you can verify yourself, or more than once or twice per turn.

## How

Write ONE marker on its own line, at the start of the line:

```
[jev] <type> [strict]: <question> [| option | option ...]
```

- `type`: `choice` (one of N), `score` (a level low-to-high), or `yn` (yes/no).
- `strict` (optional): re-ask until confidence clears the threshold, else return "insufficient".
- `choice` and `score` need at least two `|`-separated options; `yn` takes none.

```
[jev] choice: Which fix is safer? | rollback | hotfix
[jev] yn strict: Did the failing test pass?
[jev] score: Rate this diff's risk | trivial | low | medium | high | severe
```

## Working with the answer

State the evidence in your message first (jev judges from the recent session text). Emit the marker as the last thing before you end the turn when you need the answer to continue; jev reads markers on turn end. Then stop and wait. With `JEV_FEEDBACK=1` the verdict comes back as a `[jev] Decision on "...": ...` message to continue from; otherwise the user resolves it in the Jev panel and tells you.
