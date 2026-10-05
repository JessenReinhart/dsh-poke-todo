# Cordis Poke Todo

A dynamic Cordis Plugin for DeepSeek Harness that ports jcode's **auto-poke** behavior.

When an agent is about to stop a turn and its session still has unfinished todos, the Host half injects a synthetic user continuation:

> You have N incomplete todo(s). Continue working, or update the todo tool.

The plugin uses the DSH `agent/turn-stopping` serial event, the `sessionProjections` todo projection, and `agent.steer()` to continue the current turn. It stops after three consecutive pokes per session and resets its budget when no incomplete todo remains.

## Source

- `plugin/host.js`: plain JavaScript function body for `code.host`.
- `plugin/client.js`: plain JavaScript function body for `code.client`.
- `manifest.json`: runtime IDs and package metadata after installation.

## Install in the current DSH runtime

The package was defined and activated as:

- Plugin: `poke-1`
- Package: `pkg-1`
- Run: `run-1`

Dynamic Cordis plugins are in-memory. A process restart requires re-activation unless promoted through DSH's desktop dynamic-plugin promotion workflow.

## jcode behavior mapped

- `crates/jcode-base/src/todo.rs:648-653`: exact incomplete-todo message.
- `src/cli/commands.rs:2774-2813`: incomplete todos take precedence over later validation branches.
- `crates/jcode-tui/src/tui/app/commands.rs:66-73`: `/poke`, `/poke on`, `/poke off`, `/poke status` command surface.
- DSH `@deepseek-ai/dsh-agent-loop/lib/index.js:966-974`: serial turn-stopping hook and next-step recheck.
- DSH `@deepseek-ai/dsh-agent-loop/lib/index.js:789-797`: `steer()` sends to `next-step` and wakes the driver.
- DSH `@deepseek-ai/dsh-tool-todo/lib/index.js`: todo projection under `sessionProjections.stateOf(session, "todos")`.

## Safety

- Only `pending` and `in_progress` todos trigger a poke.
- `completed`, `cancelled`, and `canceled` are treated as finished.
- A signal that is already aborted is ignored.
- Duplicate processing of the same turn is ignored.
- Three consecutive pokes are the circuit breaker.
- No dynamic model-visible Tool is registered; the feature is lifecycle-driven and does not need the model to call another tool.
