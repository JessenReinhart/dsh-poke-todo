# Cordis Poke Todo

A Cordis Plugin for DeepSeek Harness that ports jcode's **auto-poke** behavior. Supports both dynamic in-session installation (`cordis_define`) and permanent DSH desktop profile installation via `cordis.patch.yml`.

When an agent is about to finish a turn while its session still holds incomplete todos, the Host half injects a synthetic continuation:

> You have N incomplete todo(s). Continue working, or update the todo tool.

The plugin listens to the DSH `agent/turn-stopping` serial event, queries the session's current todo projection from `sessionProjections`, and issues `agent.steer()` to continue the turn without dropping into an idle state.

## Architecture & Layout

- `lib/index.js`: static ES module export conforming to Cordis plugin conventions (`name`, `inject`, `apply`).
- `plugin/host.js`: dynamic host function body for runtime installation via `cordis_define`.
- `plugin/client.js`: client-side RPC bridge and styles for dynamic runtime installation.
- `cordis.patch.yml`: permanent bundle layer patch for DSH profile compositions.
- `scripts/install.mjs`: profile installer script (`node scripts/install.mjs --profile desktop`).
- `scripts/define-payload.mjs`: CLI helper emitting the dynamic `cordis_define` JSON payload.
- `test/host.test.mjs`: 8 unit tests for dynamic host sandbox execution.
- `test/static.test.mjs`: 7 unit tests for static module exports and lifecycle hooks.
- `docs/`: in-depth technical analysis and step-by-step guides.
  - `docs/jcode-analysis.md`: complete breakdown of jcode's auto-poke semantics.
  - `docs/INSTALL.md`: guide for runtime dynamic activation (`cordis_define` + `cordis_run`).
  - `docs/PROMOTE.md`: guide for permanent profile registration.

## Current Installation State

1. **Active Dynamic Plugin**: running in the live DSH runtime as `poke-1/pkg-2` (run: `run-2`).
2. **Permanent Static Installation**: linked to `C:\Users\LGSM228\.dsh\profiles\desktop\node_modules\cordis-poke-todo` and registered in `dsh.profile.bundles`. Survives desktop reloads.

## Safety & Semantics

- Tracks up to 3 consecutive pokes per session as a circuit breaker (`MAX_CONSECUTIVE_POKES = 3`).
- Pokes reset whenever a genuine human message is claimed (`agent/inbox/claimed`).
- Synonyms `cancelled` and `canceled` are treated as finished alongside `completed`.
- Aborted turns (`signal.aborted`) are safely ignored.
