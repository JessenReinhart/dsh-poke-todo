/*
 * jcode-poke-todo — Client half.
 *
 * This file's entire contents are the `code.client` value passed to the
 * `cordis_define` tool. It is evaluated inside a browser context and must
 * RETURN a Cordis Plugin.
 *
 * Available globals: ctx, React, styles, host, harness, console.
 * No JSX, no imports: use React.createElement exclusively.
 *
 * Responsibilities:
 *   1. Inject the poke-todo theme-derived styles via styles.insert(css).
 *   2. Provide Client-side RPC access to toggle and inspect poke state.
 *   3. Listen for theme/locale changes and tear down cleanly with the plugin run.
 */

const CSS = `
.poke-todo-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  user-select: none;
}
.poke-todo-chip.is-active {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
}
.poke-todo-chip button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  color: inherit;
  text-decoration: underline;
}
`

return {
  apply(ctx) {
    const removeStyles = styles.insert(CSS)
    ctx.effect(() => removeStyles, 'poke-todo styles')

    /* Expose a lightweight client service so other client plugins can query it. */
    const service = {
      getStatus(sessionId) {
        return host.call('status', { sessionId: sessionId || null })
      },
      setEnabled(sessionId, enabled) {
        return host.call('setEnabled', { sessionId, enabled })
      },
      disarmAll() {
        return host.call('disarmAll', {})
      },
    }

    ctx.provide('pokeTodo', service)
    console.log('jcode poke todo client initialized')
  },
}
