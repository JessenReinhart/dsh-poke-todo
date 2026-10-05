import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'cordis-poke-todo'
export const inject = ['sessionProjections']

export const MAX_CONSECUTIVE_POKES = 3
const SOURCE = Object.freeze({ kind: 'plugin', plugin: name })
const FINISHED = new Set(['completed', 'cancelled', 'canceled'])

function incompleteTodoMessage(count) {
  return `You have ${count} incomplete todo${count === 1 ? '' : 's'}. Continue working, or update the todo tool.`
}

export function decidePoke(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return null
  const incomplete = todos.filter((todo) => todo && typeof todo.status === 'string' && !FINISHED.has(todo.status.toLowerCase()))
  return incomplete.length === 0 ? null : incompleteTodoMessage(incomplete.length)
}

export function apply(ctx) {
  const projections = ctx.sessionProjections
  const sessions = new Map()

  const stateFor = (id) => {
    let state = sessions.get(id)
    if (!state) {
      state = { enabled: true, consecutive: 0 }
      sessions.set(id, state)
    }
    return state
  }

  const resetForHumanRequest = ({ agent, message }) => {
    if (!agent || !message || message.role !== 'user') return
    if (message.source?.kind === 'plugin' && message.source?.plugin === name) return
    stateFor(agent.id).consecutive = 0
  }

  ctx.on('agent/session-start', ({ agent }) => {
    stateFor(agent.id)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    sessions.delete(agent.id)
  })

  ctx.on('agent/inbox/claimed', resetForHumanRequest)

  ctx.on('agent/turn-stopping', ({ agent, signal }) => {
    if (signal?.aborted) return

    const state = stateFor(agent.id)
    if (!state.enabled || state.consecutive >= MAX_CONSECUTIVE_POKES) return

    const todos = projections.stateOf(agent.session, 'todos')
    const text = decidePoke(todos)

    if (text === null) {
      state.consecutive = 0
      return
    }

    state.consecutive += 1
    agent.steer(createUserMessage({
      content: [{ type: 'text', text }],
      source: SOURCE,
    }))
  })
}

export default {
  name,
  inject,
  apply,
}
