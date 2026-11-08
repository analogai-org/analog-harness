/** Chat main-model resolution ignores Harness defaults and follows task allocations. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { buildModelCatalog } from '../src/catalog.ts'
import { readChatModels, selectChatMainModel } from '../src/chat-models.ts'

beforeEach(() => { vi.stubEnv('VITEST', '') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const models = [
  { id: 'fast-current', provider: 'OpenAI', type: 'fast' },
  { id: 'reasoning-current', provider: 'Anthropic', type: 'reasoning' },
]

function backend(main: 'reasoning' | 'fast', failSave = false) {
  const send = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === '/v1/models') return Response.json({ data: models })
    if (path === '/v1/agents/default/task-models') {
      return Response.json({ agent_execution: { model_type: main } })
    }
    if (path === '/v1/agents/default/task-models/agent_execution' && init?.method === 'PUT') {
      return Response.json({ status: failSave ? 'failed' : 'success' }, { status: failSave ? 500 : 200 })
    }
    throw new Error(`Unexpected Chat request: ${path}`)
  })
  vi.stubGlobal('fetch', send)
  return send
}

it.each(['reasoning', 'fast'] as const)('uses the %s allocation rather than a saved model or catalog order', async (main) => {
  backend(main)
  const selected = { provider: main === 'fast' ? 'openai' : 'anthropic', model: `${main}-current` }
  expect((await readChatModels())?.active).toEqual(selected)
  const catalog = await buildModelCatalog(new Context(), { provider: 'deepseek-official', model: 'gpt-6-luna' })
  expect(catalog.active).toEqual(selected)
  expect(catalog.default).toEqual(selected)
  expect(catalog.groups.flatMap(group => group.models.map(model => model.id))).toEqual(['fast-current', 'reasoning-current'])
})

it('saves the main allocation through the same endpoint as the dashboard', async () => {
  const send = backend('reasoning')
  await selectChatMainModel({ provider: 'openai', model: 'fast-current' })
  expect(send).toHaveBeenLastCalledWith('http://127.0.0.1:8071/v1/agents/default/task-models/agent_execution',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify({ model_type: 'fast' }) }))
})

it('rejects an unavailable saved model without writing an allocation', async () => {
  const send = backend('reasoning')
  await expect(selectChatMainModel({ provider: 'deepseek-official', model: 'gpt-6-luna' })).rejects.toThrow('unavailable')
  expect(send.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true)
})

it('reports a failed main-model save', async () => {
  backend('reasoning', true)
  await expect(selectChatMainModel({ provider: 'openai', model: 'fast-current' })).rejects.toThrow('Could not save')
})

it('does not choose the first model when the task response is invalid', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
    input.endsWith('/v1/models') ? { data: models } : { agent_execution: { model_type: 'invalid' } },
  )))
  expect(await readChatModels()).toBeNull()
})
