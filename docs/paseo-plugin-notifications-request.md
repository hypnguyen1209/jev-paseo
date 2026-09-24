# Feature request: a plugin-facing notification API

## The gap

A Paseo plugin has no way to reach the user when the app is backgrounded or on their phone. The plugin surface offers exactly two notification channels, both in-app and both only visible while the app is open and focused:

- the composer-pill **badge** (`addComposerPill`, a passive count), and
- **`useToast`** from `@getpaseo/plugin/client/react-native` (a transient in-app toast).

The server context (`registerSettings`, `handle`, `registerProvider`, `on`, `before`) has nothing at all. There is no method to raise an OS notification, send a phone push, or mark anything as needing attention.

Paseo already has the whole pipeline: `sendOsNotification`, `@getpaseo/protocol/agent-attention-notification`, and the `push-notifications` module with registered device tokens. But it fires only from **native agent attention** (`attentionReason: needs_input | permission | finished`), which is an agent-and-app concept a plugin can't produce.

## Why it matters

jev-paseo queues typed decisions an agent asks for by emitting a `[jev]` marker. When one needs the user's call and the user is in another session, on another tab, or away from the desk, there is no way to tell them. Today they only find out by looking at the Jev tab or the pill badge. The one native signal they do get is the generic "agent finished" attention notification when the agent that emitted the marker ends its turn, which says nothing about the pending decision and never fires for a task added in the Jev UI or one left pending by shadow mode.

This is not specific to jev. Any plugin that produces work the user must act on (a review to approve, a long job that finished, a threshold that tripped) hits the same wall.

## Proposal

Give plugins a notification entry point that reuses the existing OS/push pipeline and honors the same rules native attention already follows (respect the user's notification preferences, and stay quiet when the relevant surface is focused).

Two shapes, either works:

**A. A direct notify call** on the server handler context (and/or the client context):

```ts
context.notify({
  title: "Jev needs your call",
  body: "Which fix is safer? rollback / hotfix",
  agentId,          // optional: focus-suppress and deep-link to this session
  tag: task.id,     // dedupe / replace an earlier notification for the same thing
  priority: "normal",
});
```

**B. Or let a plugin raise attention on an agent it is associated with**, reusing the exact native path (OS notification, push, badge, favicon, list highlight):

```ts
agents.ref(agentId).requestAttention({ reason: "needs_input", title, body });
```

Shape B is the smaller change if the attention payload is already the notification source of truth, and it gives the plugin the in-app affordances for free.

## Guardrails we would expect

- Opt-in per plugin, gated by the user's existing notification settings.
- Focus suppression: no notification when the target surface is already in front, exactly as agent attention behaves.
- Rate limit and `tag`-based dedupe so a chatty plugin can't spam the phone.
- No new permission surface on the plugin side beyond what the host already asks for push.

## Until then

jev-paseo does what a plugin can: the pill badge, an in-app toast when a new marker task arrives (visible only while Jev is open), and it lets the native "agent finished" notification stand in for the agent-marker case. None of that reaches a backgrounded app or a phone.
