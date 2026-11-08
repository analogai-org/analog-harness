/** Shared projection of the live LLM registry into the browser model catalog. */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { readChatModels } from './chat-models.ts'
import type {
  ModelCatalog,
  ModelReasoning,
  ModelSelection,
} from './types.ts'

function formatProviderName(provider: string): string {
  const map: Record<string, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    google: 'Google',
    groq: 'Grok',
    grok: 'Grok',
    mistral: 'Mistral AI',
    ollama: 'Ollama',
    openrouter: 'OpenRouter',
    xai: 'xAI',
    bedrock: 'AWS Bedrock',
    azure: 'Azure OpenAI',
    cohere: 'Cohere',
    together_ai: 'Together AI',
    together: 'Together AI',
    perplexity: 'Perplexity',
  }
  const lower = provider.toLowerCase()
  return map[lower] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Build the browser model catalog without requiring a Session.
 * @param ctx - Host context carrying the live LLM registry.
 * @param defaultSelection - deployment default used before a Session selects a model.
 * @returns successful non-empty provider groups and isolated provider failures.
 */
export async function buildModelCatalog(
  ctx: Context,
  defaultSelection: ModelSelection = ctx.agentDefaultModel?.currentSelection ? ctx.agentDefaultModel.currentSelection() : { provider: '', model: '' },
): Promise<ModelCatalog> {
  const chat = await readChatModels()
  if (chat !== null) {
    const microserviceModels = chat.models
    const providerMap = new Map<
      string,
      {
        id: string
        name: string
        models: Array<{
          id: string
          name: string
          description?: string
          reasoning?: ModelReasoning
        }>
      }
    >()

    for (const m of microserviceModels) {
      const providerId = m.provider
      const providerName = formatProviderName(providerId)
      let group = providerMap.get(providerId)
      if (group === undefined) {
        group = {
          id: providerId,
          name: providerName,
          models: [],
        }
        providerMap.set(providerId, group)
      }
      const description = m.type === 'reasoning' ? 'Reasoning' : 'Fast'

      group.models.push({
        id: m.id,
        name: m.id,
        description,
      })
    }

    const groups = Array.from(providerMap.values()).filter(g => g.models.length > 0)
    if (groups.length > 0) {
      return {
        default: { ...chat.active },
        active: { ...chat.active },
        routableProviders: groups.map(group => group.id),
        groups,
        failures: [],
      }
    }
  }

  // Only unit tests fall back to in-memory Cordis provider catalog
  if (!process.env.VITEST) {
    return {
      default: { provider: '', model: '' },
      active: null,
      routableProviders: [],
      groups: [],
      failures: [],
    }
  }

  const providers = ctx.llm.listProviders()
  const catalog = await Promise.all(
    providers.map(async (provider) => {
      try {
        const models = await ctx.llm.listModels(provider.id)
        const entries = await Promise.all(
          models.map(async (model) => {
            const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
            const reasoning: ModelReasoning | undefined =
              resolved.reasoning === undefined
                ? undefined
                : {
                  efforts: resolved.reasoning.efforts.map(effort => ({
                    id: effort.id,
                    name: effort.name,
                    ...(effort.description === undefined ? {} : { description: effort.description }),
                  })),
                  ...(resolved.reasoning.defaultEffort === undefined
                    ? {}
                    : { defaultEffort: resolved.reasoning.defaultEffort }),
                }
            return {
              id: model.id,
              name: model.name,
              ...(model.description === undefined ? {} : { description: model.description }),
              ...(reasoning === undefined ? {} : { reasoning }),
            }
          }),
        )
        return {
          kind: 'group' as const,
          group: { id: provider.id, name: provider.name, models: entries },
        }
      } catch (error) {
        return {
          kind: 'failure' as const,
          failure: {
            id: provider.id,
            name: provider.name,
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
    }),
  )
  const groups = catalog
    .flatMap(item => (item.kind === 'group' ? [item.group] : []))
    .filter(group => group.models.length > 0)
  return {
    default: { ...defaultSelection },
    routableProviders: groups.map(group => group.id),
    groups,
    failures: catalog.flatMap(item => (item.kind === 'failure' ? [item.failure] : [])),
  }
}

/**
 * Check a GUI selection against the current available provider catalog.
 * @param ctx - Host LLM registry.
 * @param selection - stored or explicitly requested selection.
 * @returns whether the exact model is currently advertised as available.
 */
export async function modelAvailable(ctx: Context, selection: ModelSelection): Promise<boolean> {
  const microserviceModels = (await readChatModels())?.models
  if (microserviceModels && microserviceModels.length > 0) {
    return microserviceModels.some(model => model.provider === selection.provider.toLowerCase()
      && model.id === selection.model)
  }

  if (!process.env.VITEST) return false

  if (!ctx.llm.listProviders().some(provider => provider.id === selection.provider)) return false
  let models: readonly LlmModelInfo[]
  try {
    models = await ctx.llm.listModels(selection.provider)
  } catch (error) {
    throw new RemoteError(
      'session/model-unavailable',
      error instanceof Error ? error.message : String(error),
      { provider: selection.provider, model: selection.model },
    )
  }
  return models.some(model => model.id === selection.model)
}

/**
 * Check configured provider API-key references independently of model availability.
 * @param ctx - Host registry, settings, and credential services.
 * @returns whether any API-key provider has a configured credential.
 */
export async function hasProviderApiKey(ctx: Context): Promise<boolean> {
  const settings = ctx.get('settings')
  const credentials = ctx.get('credentials')
  if (settings === undefined || credentials === undefined) {
    throw new RemoteError('session/provider-credentials-unavailable', 'provider credentials are unavailable', {})
  }
  const namespaces = settings.describe({ redactSecrets: true })
  for (const provider of ctx.llm.listConfigurableProviders()) {
    if (provider.provider === 'deepseek-account') continue
    let profile = namespaces.find(namespace => namespace.ns === provider.settingsNs)?.value
    for (const key of provider.settingsPath) {
      profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, key) : undefined
    }
    if (typeof profile !== 'object' || profile === null) continue
    const ref: unknown = Reflect.get(profile, 'apiKeyEnv')
    if (typeof ref === 'string' && ref.length > 0
      && (await credentials.describe(credentialRef(ref))).configured) return true
  }
  return false
}
