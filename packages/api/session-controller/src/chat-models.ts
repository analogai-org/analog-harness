/** Read and update the local Chat service's main model through its task allocations. */
import type { ModelSelection } from './types.ts'

interface ChatModel {
  id: string
  provider: string
  type: 'reasoning' | 'fast'
}

interface ChatModels {
  origin: string
  models: ChatModel[]
  active: ModelSelection
}

/**
 * Read configured Chat models and resolve the Agent Execution allocation.
 * @returns the current Chat selection, or null when no local Chat service is available.
 */
export async function readChatModels(): Promise<ChatModels | null> {
  if (process.env.VITEST) return null
  for (const origin of ['http://127.0.0.1:8071', 'http://localhost:8071']) {
    try {
      const response = await fetch(`${origin}/v1/models`, { signal: AbortSignal.timeout(1500) })
      if (!response.ok) continue
      const body: unknown = await response.json()
      if (body === null || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) continue
      const models = body.data.map((entry: unknown): ChatModel => {
        if (entry === null || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string'
          || !('type' in entry) || (entry.type !== 'reasoning' && entry.type !== 'fast')) {
          throw new Error('Invalid Chat model entry')
        }
        const provider = 'provider' in entry ? entry.provider : 'owned_by' in entry ? entry.owned_by : undefined
        if (typeof provider !== 'string' || !provider) throw new Error('Missing Chat model provider')
        return { id: entry.id, provider: provider.toLowerCase(), type: entry.type }
      })
      const first = models[0]
      if (first === undefined) return null
      const tasksResponse = await fetch(`${origin}/v1/agents/default/task-models`, { signal: AbortSignal.timeout(1500) })
      if (!tasksResponse.ok) throw new Error('Could not read Chat task allocations')
      const tasks: unknown = await tasksResponse.json()
      if (tasks === null || typeof tasks !== 'object' || !('agent_execution' in tasks)
        || tasks.agent_execution === null || typeof tasks.agent_execution !== 'object'
        || !('model_type' in tasks.agent_execution)
        || (tasks.agent_execution.model_type !== 'reasoning' && tasks.agent_execution.model_type !== 'fast')) {
        throw new Error('Invalid Chat Agent Execution allocation')
      }
      const mainModelType = tasks.agent_execution.model_type
      const active = models.find(model => model.type === mainModelType) ?? first
      return { origin, models, active: { provider: active.provider, model: active.id } }
    } catch (_unavailableChatService) {
      // Both loopback names address the same local service; try the other address.
    }
  }
  return null
}

/**
 * Set Chat's main task allocation to the exact configured model the user chose.
 * @param selection - provider and model from the live Chat catalog.
 * @returns after Chat commits its Agent Execution allocation; rejects unavailable selections or failed writes.
 */
export async function selectChatMainModel(selection: ModelSelection): Promise<void> {
  const chat = await readChatModels()
  const model = chat?.models.find(model => model.provider === selection.provider && model.id === selection.model)
  if (chat === null || model === undefined) throw new Error('The selected Chat model is unavailable')
  const response = await fetch(`${chat.origin}/v1/agents/default/task-models/agent_execution`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_type: model.type }),
    signal: AbortSignal.timeout(1500),
  })
  if (!response.ok) throw new Error('Could not save Chat main model')
}
