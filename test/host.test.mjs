import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hostSourcePath = path.resolve(__dirname, '../plugin/host.js')
const hostSource = fs.readFileSync(hostSourcePath, 'utf8')

function createTestHarness() {
  const listeners = new Map()
  const handlers = new Map()
  const todoStore = new Map()

  const ctx = {
    sessionProjections: {
      stateOf(session, key) {
        if (key === 'todos') {
          return todoStore.get(session) ?? null
        }
        return null
      }
    },
    get(name) {
      if (name === 'sessionProjections') return this.sessionProjections
      return undefined
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
    }
  }

  const harness = {
    handle(method, handler) {
      handlers.set(method, handler)
    }
  }

  const sandboxGlobals = {
    ctx,
    harness,
    console: {
      log: () => {},
      error: () => {}
    },
    btoa: (s) => Buffer.from(s).toString('base64'),
    atob: (b) => Buffer.from(b, 'base64').toString('utf8'),
    TextEncoder,
    TextDecoder
  }

  const fn = new Function(...Object.keys(sandboxGlobals), hostSource)
  const plugin = fn(...Object.values(sandboxGlobals))

  plugin.apply(ctx)

  return {
    ctx,
    handlers,
    todoStore,
    emit(event, payload) {
      const fns = listeners.get(event) || []
      for (const f of fns) {
        f(payload)
      }
    }
  }
}

function createMockAgent(id, sessionId = `sess-${id}`) {
  const steered = []
  const session = { id: sessionId }
  return {
    id,
    session,
    steered,
    steer(msg) {
      steered.push(msg)
    }
  }
}

test('jcode poke-todo: ignores turn-stopping if no todos exist', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 0)
})

test('jcode poke-todo: ignores turn-stopping if all todos are completed', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [
    { content: 'Task 1', status: 'completed' },
    { content: 'Task 2', status: 'completed' }
  ])

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 0)
})

test('jcode poke-todo: pokes with exact singular message when 1 todo is pending', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [
    { content: 'Fix bug', status: 'pending' },
    { content: 'Done item', status: 'completed' }
  ])

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)
  assert.equal(agent.steered[0].role, 'user')
  assert.equal(
    agent.steered[0].content[0].text,
    'You have 1 incomplete todo. Continue working, or update the todo tool.'
  )
})

test('jcode poke-todo: pokes with exact plural message for mixed incomplete todos', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [
    { content: 'Pending task', status: 'pending' },
    { content: 'Active task', status: 'in_progress' },
    { content: 'Done task', status: 'completed' }
  ])

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)
  assert.equal(
    agent.steered[0].content[0].text,
    'You have 2 incomplete todos. Continue working, or update the todo tool.'
  )
})

test('jcode poke-todo: does not poke for cancelled or canceled variants', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [
    { content: 'Skipped task', status: 'cancelled' },
    { content: 'Dropped task', status: 'canceled' },
    { content: 'Done task', status: 'completed' }
  ])

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 0)
})

test('jcode poke-todo: enforces MAX_CONSECUTIVE_POKES limit (3 pokes max)', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [{ content: 'Work', status: 'pending' }])

  // Turn 1
  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)

  // Turn 2
  env.emit('agent/turn-stopping', { agent, turn: 2, signal: { aborted: false } })
  assert.equal(agent.steered.length, 2)

  // Turn 3
  env.emit('agent/turn-stopping', { agent, turn: 3, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)

  // Turn 4 -> circuit breaker tripped
  env.emit('agent/turn-stopping', { agent, turn: 4, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)
})

test('jcode poke-todo: ignores aborted signals', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')
  env.todoStore.set(agent.session, [{ content: 'Pending', status: 'pending' }])

  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: true } })
  assert.equal(agent.steered.length, 0)
})

test('jcode poke-todo: RPC handlers status, setEnabled, and disarmAll work as expected', () => {
  const env = createTestHarness()
  const agent = createMockAgent('agent-1')

  const statusHandler = env.handlers.get('status')
  const setEnabledHandler = env.handlers.get('setEnabled')
  const disarmAllHandler = env.handlers.get('disarmAll')

  assert(statusHandler && setEnabledHandler && disarmAllHandler)

  const initialStatus = statusHandler({ sessionId: agent.id })
  assert.equal(initialStatus.enabled, true)
  assert.equal(initialStatus.consecutive, 0)

  // Disable poke
  setEnabledHandler({ sessionId: agent.id, enabled: false })
  const updatedStatus = statusHandler({ sessionId: agent.id })
  assert.equal(updatedStatus.enabled, false)

  // When disabled, no poke is sent
  env.todoStore.set(agent.session, [{ content: 'Pending', status: 'pending' }])
  env.emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })
  assert.equal(agent.steered.length, 0)
})
