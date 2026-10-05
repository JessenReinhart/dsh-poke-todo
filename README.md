# dsh-poke-todo

A [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Cordis plugin that ports the **auto-poke** behavior from [jcode](https://github.com/1jehuang/jcode).

When an agent is about to finish a turn while its session still has incomplete todos, the Host half injects a synthetic continuation:

> You have N incomplete todo(s). Continue working, or update the todo tool.

The plugin listens to the DSH `agent/turn-stopping` serial event, queries the session's current todo projection from `sessionProjections`, and calls `agent.steer()` to continue the turn instead of idling.

## Install

The plugin declares a `dsh.bundle` manifest, so a published build is installed with the DSH CLI:

```sh
dsh plugin --profile <name> add dsh-poke-todo
```

For a local checkout, use the repo installer (runs `pnpm add link:` and registers the bundle):

```sh
node scripts/install.mjs --profile desktop --from local
```

## Layout

- `lib/index.js` — static ES module exporting the Cordis contract (`name`, `inject`, `apply`).
- `plugin/host.js` — dynamic host function body for `cordis_define`.
- `plugin/client.js` — client-side RPC bridge and styles for dynamic installation.
- `cordis.patch.yml` — bundle layer patch for permanent profile compositions.
- `scripts/install.mjs` — profile installer.
- `scripts/define-payload.mjs` — emits the dynamic `cordis_define` JSON payload.
- `test/` — unit tests for the host and static modules.

## Safety & semantics

- Up to `MAX_CONSECUTIVE_POKES = 3` consecutive pokes per session before the circuit breaker trips.
- The budget resets when a genuine human message is claimed (`agent/inbox/claimed`).
- `completed`, `cancelled`, and `canceled` are treated as finished.
- Aborted turns (`signal.aborted`) are ignored.

## Publish

```sh
npm version patch && npm publish
```

The bundle manifest in `package.json` (`dsh.bundle.patch`) and the root `cordis.patch.yml` make the published package installable via `dsh plugin add`.