# Installing dsh-poke-todo into DeepSeek Harness

This guide describes how to install and manage the `dsh-poke-todo` dynamic Cordis plugin in DeepSeek Harness.

## Dynamic Plugin Installation

Dynamic Cordis plugins run directly in the harness memory space using the model-facing `cordis_define` and `cordis_run` tools.

### 1. Define the Plugin

Call `cordis_define` with:
- `plugin`: `{ kind: "new", idPrefix: "poke" }` (or `{ kind: "existing", pluginId: "poke-1" }` for updates)
- `name`: `"jcode poke todo"`
- `purpose`: `"Nudge an idle agent to continue working when its session has incomplete todos."`
- `code.host`: raw source code of `plugin/host.js`
- `code.client`: raw source code of `plugin/client.js`

You can generate the complete JSON payload using the helper script:
```bash
node scripts/define-payload.mjs
```

### 2. Activate with cordis_run

After `cordis_define` returns a `pluginId` and `packageId`:
```json
{
  "pluginId": "poke-1",
  "packageId": "pkg-1",
  "mode": "run"
}
```

- When activating a client half, user approval is requested.
- Once approved, the runtime completes initialization asynchronously.

### 3. Verification & Diagnostics

- Check status: `cordis_inspect_self(pluginId: "poke-1")`
- Stop execution: `cordis_stop(pluginId: "poke-1")`
- Remove completely: `cordis_undefine(pluginId: "poke-1")`
