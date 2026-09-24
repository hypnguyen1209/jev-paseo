# Issue: expose a notification API to plugins (OS + push), not just in-app toast

> Copy the line below as the issue title, and everything under "Body" as the issue body.

**Title:** `Plugins can't notify the user (OS / push): expose a plugin notification or attention API`

---

## Body

### Summary

A plugin has no way to reach the user when the app is backgrounded or on their phone. The only notification channels on the plugin surface are in-app and only work while the app is open and focused: the composer-pill **badge** (`addComposerPill`) and **`useToast`** (`@getpaseo/plugin/client/react-native`). The server context (`registerSettings`, `handle`, `registerProvider`, `on`, `before`) has nothing.

Paseo already ships the pipeline for this (`sendOsNotification`, `@getpaseo/protocol/agent-attention-notification`, the `push-notifications` module with registered device tokens), but it fires only from native **agent attention** (`attentionReason: needs_input | permission | finished`), which a plugin can't produce.

### Steps to reproduce

1. Install a directory plugin that queues work the user must act on. Example: [jev-paseo](https://github.com/hypnguyen1209/jev-paseo) queues a typed decision when an agent emits a `[jev]` marker.
2. From a plugin server handler or an `agent.turn_ended` hook, try to notify the user that an item needs their input.
3. Inspect the API surface. Server: `registerSettings` / `handle` / `registerProvider` / `on` / `before`. Client: `addComposerPill` (a passive badge) and `useToast` (in-app). There is no `notify`, no push, no way to set attention.
4. Background the app, or move to the phone. The pending item produces no OS notification and no push.

### Expected behavior

A plugin can raise an OS/system notification and a phone push for user-actionable work, going through the same pipeline and rules that native agent attention already uses (respect the user's notification preferences, and stay quiet when the relevant surface is focused).

### Actual behavior

No plugin-facing notification or attention API. The only signals are the in-app badge and toast, visible only while the app is open and focused. For the agent-marker case the user gets the generic "agent finished" attention notification when the emitting agent ends its turn, which says nothing about the pending item and never fires for a task added in the plugin's own UI or left pending by shadow mode.

### Proposed API

Either shape works; B is likely the smaller change since the attention payload already drives notifications.

**A. A direct notify call** on the server handler context (and/or client context):

```ts
context.notify({
  title: "Jev needs your call",
  body: "Which fix is safer? rollback / hotfix",
  agentId,        // optional: focus-suppress and deep-link to this session
  tag: task.id,   // dedupe / replace an earlier notification for the same thing
  priority: "normal",
});
```

**B. Let a plugin raise attention on an associated agent**, reusing the exact native path (OS notification, push, badge, favicon, list highlight):

```ts
agents.ref(agentId).requestAttention({ reason: "needs_input", title, body });
```

### Guardrails expected

- [ ] Opt-in per plugin, gated by the user's existing notification settings.
- [ ] Focus suppression: no notification when the target surface is already in front, as agent attention behaves.
- [ ] Rate limit and `tag`-based dedupe so a chatty plugin can't spam the phone.
- [ ] No new push-permission surface beyond what the host already requests.

### Alternatives / current workaround

Until this exists a plugin can only do the in-app badge, an in-app toast when new work arrives (visible only while the plugin UI is open), and lean on the native "agent finished" notification for the agent-marker case. None of that reaches a backgrounded app or a phone.

### Environment

- Paseo app/daemon: 0.9.1
- Plugin SDK (`@getpaseo/plugin`): 0.9.0-beta.2
- Repro plugin: jev-paseo (directory install)
