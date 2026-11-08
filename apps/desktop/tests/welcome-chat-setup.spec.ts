/** Onboarding saves models only in Chat; Harness stores the connection settings. */
import { afterEach, expect, it, vi } from 'vitest'
import { connectDesktopWelcome } from '../src/welcome-backend.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('configures both Chat models without copying a model into Harness settings', async () => {
  const modelWrites: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname
    if (path === '/v1/users/init') return Response.json({ ok: true })
    if (path === '/v1/agents/default') return Response.json({ id: 'default', api_key: 'chat-agent-key' })
    if (path === '/v1/providers') return Response.json([{ id: 'chat-provider', name: 'openai', provider_type: 'openai' }])
    if (path === '/v1/agents/default/models' && init?.method === 'POST') {
      modelWrites.push(JSON.parse(String(init.body)))
      return Response.json({ id: `chat-model-${modelWrites.length}` })
    }
    throw new Error(`Unexpected Chat request: ${path}`)
  }))
  const settingsWrites: unknown[] = []
  const send: Parameters<typeof connectDesktopWelcome>[1] = async (_input, init) => {
    if (init?.method !== 'POST') return new Response('index')
    const request = JSON.parse(String(init.body)) as {
      rpcId: string; method: string; payload: { args: unknown }
    }
    const value = request.method === 'settings/describe' ? { namespaces: [
      { ns: 'llm-deepseek', value: { apiKeyEnv: 'CHAT_KEY' } },
      { ns: 'agent-default-model', value: { provider: 'deepseek-official', model: 'stale-model' } },
    ] } : undefined
    if (request.method === 'settings/update') settingsWrites.push(request.payload.args)
    return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value } })
  }
  const backend = await connectDesktopWelcome('http://127.0.0.1:19387/?token=fixture', send)
  expect(await backend.saveSetup?.({
    providerType: 'openai', providerApiKey: 'upstream-key', reasoningModel: 'chat-reasoning', fastModel: 'chat-fast',
  })).toEqual({ ok: true })
  expect(modelWrites).toEqual([
    { agent_id: 'default', provider_id: 'chat-provider', name: 'chat-reasoning', type: 'reasoning' },
    { agent_id: 'default', provider_id: 'chat-provider', name: 'chat-fast', type: 'fast' },
  ])
  expect(settingsWrites).toEqual([{ ns: 'llm-deepseek', patch: { baseURL: 'http://localhost:8071/v1' } }])
})
