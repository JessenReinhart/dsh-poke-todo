import test from 'node:test'
import assert from 'node:assert/strict'
import plugin, { name, inject, apply, decidePoke } from '../lib/index.js'

function createHarness() {
  const listeners = new Map()
  const todoStore = new Map()
  const ctx = {
    sessionProjections: {
      stateOf(session, key) {
        if (key === 'todos') return todoStore.get(session) ?? null
        return null
      },
    },
    get(k) {
      if (k === 'sessionProjections') return this.sessionProjections
      return undefined
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
      return () => {
        const list = listeners.get(event)
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      }
    },
  }
  return {
    ctx,
    setTodos(session, todos) {
      todoStore.set(session, todos)
    },
    async emit(event, payload) {
      const handlers = listeners.get(event) ?? []
      for (const handler of handlers) {
        await handler(payload)
      }
    },
  }
}

function createAgent(id, session = id) {
  const steered = []
  return {
    id,
    session,
    steer(msg) {
      steered.push(msg)
    },
    get steered() {
      return steered
    },
  }
}

test('static plugin exports Cordis contract', () => {
  assert.equal(name, 'cordis-poke-todo')
  assert.deepEqual(inject, ['sessionProjections'])
  assert.equal(typeof apply, 'function')
  assert.equal(plugin.name, name)
  assert.deepEqual(plugin.inject, inject)
  assert.equal(plugin.apply, apply)
})

test('decidePoke returns correct message or null', () => {
  assert.equal(decidePoke([]), null)
  assert.equal(decidePoke(null), null)
  assert.equal(decidePoke([{ status: 'completed' }, { status: 'cancelled' }]), null)
  assert.equal(decidePoke([{ status: 'pending' }]), 'You have 1 incomplete todo. Continue working, or update the todo tool.')
  assert.equal(decidePoke([{ status: 'pending' }, { status: 'in_progress' }]), 'You have 2 incomplete todos. Continue working, or update the todo tool.')
})

test('pokes agent with valid frozen user message on turn-stopping when todos incomplete', async () => {
  const harness = createHarness()
  apply(harness.ctx)
  const agent = createAgent('s1')
  harness.setTodos('s1', [{ status: 'pending' }])

  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)
  const msg = agent.steered[0]
  assert.equal(msg.role, 'user')
  assert.ok(msg.id && typeof msg.id === 'string' && msg.id.length > 0)
  assert.equal(msg.source?.kind, 'plugin')
  assert.equal(msg.source?.plugin, 'cordis-poke-todo')
  assert.equal(msg.content[0].text, 'You have 1 incomplete todo. Continue working, or update the todo tool.')
})

test('budget resets on new human user request', async () => {
  const harness = createHarness()
  apply(harness.ctx)
  const agent = createAgent('s1')
  harness.setTodos('s1', [{ status: 'pending' }])

  // Poke 3 times to exhaust budget
  for (let i = 0; i < 3; i++) {
    await harness.emit('agent/turn-stopping', { agent, turn: i, signal: { aborted: false } })
  }
  assert.equal(agent.steered.length, 3)

  // 4th turn stopping does not poke
  await harness.emit('agent/turn-stopping', { agent, turn: 3, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)

  // Synthetic poke message in inbox does NOT reset budget
  await harness.emit('agent/inbox/claimed', {
    agent,
    message: { role: 'user', source: { kind: 'plugin', plugin: 'cordis-poke-todo' } },
  })
  await harness.emit('agent/turn-stopping', { agent, turn: 4, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)

  // Human user message resets budget
  await harness.emit('agent/inbox/claimed', {
    agent,
    message: { role: 'user', source: { kind: 'user' } },
  })

  // Can poke again
  await harness.emit('agent/turn-stopping', { agent, turn: 5, signal: { aborted: false } })
  assert.equal(agent.steered.length, 4)
})

test('allows multiple continuation stops in the same turn until budget exhausted', async () => {
  const harness = createHarness()
  apply(harness.ctx)
  const agent = createAgent('s1')
  harness.setTodos('s1', [{ status: 'pending' }])

  // Steer keeps agent in same turn; consecutive turn-stopping events in turn 0 must poke up to MAX_CONSECUTIVE_POKES
  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)

  // 4th stop in same turn blocked
  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  assert.equal(agent.steered.length, 3)
})

test('aborted signal is ignored', async () => {
  const harness = createHarness()
  apply(harness.ctx)
  const agent = createAgent('s1')
  harness.setTodos('s1', [{ status: 'pending' }])

  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: true } })
  assert.equal(agent.steered.length, 0)
})

test('reset budget when todos completed', async () => {
  const harness = createHarness()
  apply(harness.ctx)
  const agent = createAgent('s1')
  harness.setTodos('s1', [{ status: 'pending' }])

  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)

  // Mark completed
  harness.setTodos('s1', [{ status: 'completed' }])
  await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  assert.equal(agent.steered.length, 1)

  // Add new pending todo -> full budget available
  harness.setTodos('s1', [{ status: 'pending' }])
  for (let i = 0; i < 3; i++) {
    await harness.emit('agent/turn-stopping', { agent, turn: 0, signal: { aborted: false } })
  }
  assert.equal(agent.steered.length, 4)
})
