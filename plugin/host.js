/*
 * jcode-poke-todo — Host half.
 *
 * This file's entire contents are the `code.host` value passed to the
 * `cordis_define` tool. It is a plain JavaScript *function body* (not a
 * module): the DSH Cordis host runner wraps it in an async IIFE, evaluates it
 * inside a `node:vm` sandbox, and expects it to RETURN a Cordis Plugin.
 *
 * Available sandbox globals (host): ctx, harness, console, btoa, atob,
 * TextEncoder, TextDecoder. No imports, no require, no JSX, no TypeScript.
 *
 * Behaviour ported from the jcode harness (github.com/1jehuang/jcode):
 *
 *   crates/jcode-base/src/todo.rs:648   build_auto_poke_message()
 *   crates/jcode-tui/src/tui/app/commands.rs:50-119  /poke command + state
 *   src/cli/commands.rs:2774-2813   build_run_auto_poke_follow_up_from_todos()
 *
 * jcode fires the poke at the end of a turn when the todo list still holds
 * items that are neither completed nor cancelled, capped by a turn budget and
 * disarmed on a non-retryable error. DSH exposes the same shape:
 *
 *   - `agent/turn-stopping` (serial, Scoped<Agent>) fires exactly when the
 *     loop is about to close a turn with no live tool calls and no fresh
 *     steering — dsh-agent-loop/lib/index.js:966-972.
 *   - `ctx.sessionProjections.stateOf(agent.session, "todos")` returns the
 *     live TodoItem[] registered by @deepseek-ai/dsh-tool-todo, or null.
 *   - `agent.steer(message)` inserts a UserMessage at `next-step` and wakes
 *     the driver, so the turn continues instead of closing. This is the same
 *     primitive dsh-hooks-codex uses to honour a "deny" Stop hook
 *     (dsh-hooks-codex/lib/index.js:282-291).
 */

/** Message attribution, mirroring jcode's synthetic-continuation marker. */
const SOURCE = { kind: 'plugin', plugin: 'jcode-poke-todo' }

/**
 * Consecutive pokes allowed before the loop disarms itself for this session.
 * jcode uses a configurable turn budget (run_command_auto_poke_max_turns);
 * 3 is a safe fixed default that cannot spin forever on a stubborn model.
 */
const MAX_CONSECUTIVE_POKES = 3

/** Statuses jcode treats as "finished" for the incomplete-todo poke. */
const FINISHED = new Set(['completed', 'cancelled', 'canceled'])

/** sessionId -> { enabled, consecutive } */
const sessions = new Map()

function stateFor(sessionId) {
  let state = sessions.get(sessionId)
  if (!state) {
    state = { enabled: true, consecutive: 0 }
    sessions.set(sessionId, state)
  }
  return state
}

/**
 * A UserMessage is frozen and identity-bearing (dsh-llm createMessage adds an
 * `id`); the inbox rejects duplicate ids but accepts an id-less message and
 * freezes what it is given. We supply our own id to be explicit.
 */
let counter = 0
function nextId() {
  counter += 1
  return `poke-${Date.now().toString(36)}-${counter.toString(36)}`
}

function pokeMessage(text) {
  return {
    id: nextId(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: SOURCE,
  }
}

/** Verbatim port of jcode's build_auto_poke_message(). */
function incompleteTodoMessage(count) {
  return `You have ${count} incomplete todo${count === 1 ? '' : 's'}. Continue working, or update the todo tool.`
}

/**
 * Decide the poke text for one todo snapshot, or null when nothing is owed.
 * Mirrors the Incomplete branch of build_run_auto_poke_follow_up_from_todos.
 */
function decidePoke(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return null
  const incomplete = todos.filter(
    (todo) => todo && typeof todo.status === 'string' && !FINISHED.has(todo.status.toLowerCase()),
  )
  if (incomplete.length === 0) return null
  return incompleteTodoMessage(incomplete.length)
}

return {
  inject: ['sessionProjections'],

  apply(ctx) {
    const projections = ctx.sessionProjections

    ctx.on('agent/session-start', ({ agent }) => {
      stateFor(agent.id)
    })

    ctx.on('agent/disposed', ({ agent }) => {
      sessions.delete(agent.id)
    })

    ctx.on('agent/inbox/claimed', ({ agent, message }) => {
      if (!agent || !message || message.role !== 'user') return
      if (message.source && message.source.kind === 'plugin' && message.source.plugin === SOURCE.plugin) return
      stateFor(agent.id).consecutive = 0
    })

    /*
     * Serial listener: the loop awaits every handler before it decides to
     * break out of the step cycle, so a steer() performed here is visible to
     * the `inbox.nextStep.length === 0` re-check on the next line.
     */
    ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
      if (signal && signal.aborted) return

      const state = stateFor(agent.id)
      if (!state.enabled) return
      if (state.consecutive >= MAX_CONSECUTIVE_POKES) return

      const todos = projections.stateOf(agent.session, 'todos')
      const text = decidePoke(todos)

      if (text === null) {
        // Nothing owed: the model earned the stop, reset the budget.
        state.consecutive = 0
        return
      }

      state.consecutive += 1
      agent.steer(pokeMessage(text))
      console.log(`poke ${state.consecutive}/${MAX_CONSECUTIVE_POKES} for session ${agent.id}: ${text}`)
    })

    /* ---- Package-private RPC surface for the Client half ---- */

    harness.handle('status', (args) => {
      const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : null
      if (sessionId === null) {
        const out = []
        for (const [id, state] of sessions) out.push({ sessionId: id, ...state })
        return { sessions: out, maxConsecutivePokes: MAX_CONSECUTIVE_POKES }
      }
      const state = sessions.get(sessionId)
      return {
        sessionId,
        enabled: state ? state.enabled : true,
        consecutive: state ? state.consecutive : 0,
        lastPokedTurn: state ? state.lastPokedTurn : -1,
        maxConsecutivePokes: MAX_CONSECUTIVE_POKES,
      }
    })

    harness.handle('setEnabled', (args) => {
      const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : null
      const enabled = !!(args && args.enabled)
      if (sessionId === null) return { ok: false, reason: 'sessionId required' }
      const state = stateFor(sessionId)
      state.enabled = enabled
      if (!enabled) state.consecutive = 0
      return { ok: true, sessionId, enabled, consecutive: state.consecutive }
    })

    /* Disarm everything, the way jcode's disable_auto_poke() does. */
    harness.handle('disarmAll', () => {
      let cleared = 0
      for (const state of sessions.values()) {
        state.enabled = false
        state.consecutive = 0
        cleared += 1
      }
      return { ok: true, cleared }
    })
  },
}
