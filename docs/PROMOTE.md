# Promoting to Permanent Plugin Installation

Dynamic Cordis plugins loaded through `cordis_define` reside in `DynamicCordisRegistry` in-memory structures and do not persist across process restarts unless installed as static profile plugins or promoted.

## 1. Profile Staging & Bundle Patch

DSH supports static plugin loading via desktop and web profile compositions:

1. Place the static module under the user profile directory:
   ```text
   %USERPROFILE%\.dsh\profiles\desktop\node_modules\cordis-poke-todo
   ```
2. Include a `cordis.patch.yml` file defining the bundle layer injection:
   ```yaml
   - insert:
       - id: poke-todo
         name: 'cordis-poke-todo'
   ```
3. Export an `apply(ctx)` plugin function conforming to Cordis specifications.

## 2. Re-Activation Fallback

If running purely dynamic instances without profile modifications:
- Run `node scripts/define-payload.mjs` on startup.
- Use `cordis_define` and `cordis_run` to restore the plugin state.
