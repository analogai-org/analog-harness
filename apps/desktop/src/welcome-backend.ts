import type { ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types'
/** Native welcome operations using the shared Web authentication and RPC APIs. */

import { randomUUID } from 'node:crypto'
import { desktopAccountBackend, type DesktopAccountBackend } from './account-backend.ts'
import type { AnalogSetupParams, AnalogSetupResult } from './welcome-api.ts'

/** Metadata needed before the native entry or workspace becomes visible. */
export interface WelcomeState {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
  readonly writable: boolean
  readonly localePreference: string | null
  readonly hasMicroserviceModels?: boolean
}

/** Narrow operations available to the native welcome flow. */
export interface DesktopWelcomeBackend {
  /** @returns the current Host policy; every read observes live configuration. */
  analyticsEnabled(): Promise<boolean>
  readonly account: DesktopAccountBackend
  /** @param event - desktop-owned fields. @returns after local Host intake. */
  report(event: ProductEvent): Promise<void>
  /** @returns Configured-key presence and the shared language preference, without credential values. */
  read(): Promise<WelcomeState>
  /** @returns The saved UI language without account or provider requests. */
  readLocalePreference(): Promise<string | null>
  /**
   * Complete Analog AI onboarding: configure upstream provider, models, and local backend agent.
   */
  saveSetup?(params: AnalogSetupParams): Promise<AnalogSetupResult>
  /**
   * @param apiKey - User-entered official provider key.
   * @returns A safe write outcome without provider diagnostics.
   */
  save(apiKey: string): Promise<{ ok: boolean }>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns metadata reads and write-only credential operations over standard RPC.
 */
export async function connectDesktopWelcome(
  authenticatedUrl: string,
  send: (input: string, init?: RequestInit) => Promise<Response>,
  cookies: () => Promise<string> = () => Promise.resolve(''),
): Promise<DesktopWelcomeBackend> {
  const origin = new URL(authenticatedUrl).origin
  const authenticated = await send(authenticatedUrl, { credentials: 'include' })
  await authenticated.body?.cancel()
  if (!authenticated.ok) throw new Error('desktop welcome: Web authentication failed')
  const invoke = async (
    request: { namespace: string; method: string; args: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const rpcId = randomUUID()
    const method = `${request.namespace}/${request.method}`
    const response = await send(new URL(`/api/${method}`, origin).href, {
      method: 'POST', credentials: 'include', redirect: 'error', ...(signal === undefined ? {} : { signal }),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: request.args } }),
    })
    if (!response.ok) throw new Error('desktop welcome: Web request failed')
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
      || !record(envelope.result)) {
      throw new Error(`desktop welcome: Web RPC ${method} failed (malformed response)`)
    }
    if (envelope.result.ok !== true) {
      const err = record(envelope.result.error) ? envelope.result.error : {}
      const errMsg = typeof err.message === 'string' ? err.message : JSON.stringify(err)
      throw new Error(`desktop welcome: Web RPC ${method} failed: ${errMsg}`)
    }
    return envelope.result.value
  }
  const account = desktopAccountBackend(origin, invoke, cookies)
  const settingsAndReference = async () => {
    const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
    if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop welcome: missing settings namespaces')
    const official: unknown = settings.namespaces.find((item: unknown) => record(item) && item.ns === 'llm-deepseek')
    if (official === undefined) return { settings: { namespaces: settings.namespaces }, ref: undefined }
    if (!record(official) || !record(official.value) || typeof official.value.apiKeyEnv !== 'string') {
      throw new Error('desktop welcome: missing official DeepSeek credential reference')
    }
    return { settings: { namespaces: settings.namespaces }, ref: official.value.apiKeyEnv }
  }
  const localePreference = (namespaces: unknown[]): string | null => {
    const locale: unknown = namespaces.find((item: unknown) => record(item) && item.ns === 'locale')
    if (!record(locale) || !record(locale.value)
      || (locale.value.preference !== undefined && typeof locale.value.preference !== 'string')) {
      throw new Error('desktop welcome: invalid locale preference')
    }
    return locale.value.preference ?? null
  }
  const read = async (): Promise<WelcomeState> => {
    const { settings, ref } = await settingsAndReference()
    const providers = await invoke({ namespace: 'llm', method: 'listConfigurableProviders', args: {} })
    if (!Array.isArray(providers)) throw new Error('desktop welcome: invalid provider directory')
    const namespaces = settings.namespaces
    const refs = providers.flatMap((provider: unknown) => {
      if (!record(provider) || typeof provider.settingsNs !== 'string' || !Array.isArray(provider.settingsPath)) {
        throw new Error('desktop welcome: invalid provider settings address')
      }
      const namespace: unknown = namespaces.find((item: unknown) => record(item) && item.ns === provider.settingsNs)
      let value: unknown = record(namespace) ? namespace.value : undefined
      for (const key of provider.settingsPath as unknown[]) {
        if (typeof key !== 'string') throw new Error('desktop welcome: invalid provider settings path')
        value = record(value) ? value[key] : undefined
      }
      return record(value) && typeof value.apiKeyEnv === 'string' ? [value.apiKeyEnv] : []
    })
    const unique = [...new Set([...(ref === undefined ? [] : [ref]), ...refs])]
    const states: Record<string, unknown> = {}
    // credentials.describe accepts at most 64 references per request.
    for (let offset = 0; offset < unique.length; offset += 64) {
      const batch = await invoke({ namespace: 'credentials', method: 'describe', args: { refs: unique.slice(offset, offset + 64) } })
      if (!record(batch)) throw new Error('desktop welcome: invalid credential metadata')
      Object.assign(states, batch)
    }
    if (ref !== undefined && !record(states[ref])) throw new Error('desktop welcome: missing credential metadata')

    let hasMicroserviceModels = false
    for (const url of ['http://127.0.0.1:8071/v1/agents/default', 'http://localhost:8071/v1/agents/default']) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 1000)
        const [modelsRes, provRes] = await Promise.all([
          fetch(`${url}/models`, { signal: controller.signal }),
          fetch(`${url}/providers`, { signal: controller.signal }),
        ])
        clearTimeout(timer)
        if (modelsRes.ok && provRes.ok) {
          const modelsBody = (await modelsRes.json()) as unknown
          const provBody = (await provRes.json()) as unknown
          const modelsList = Array.isArray(modelsBody) ? modelsBody : (modelsBody as any)?.models || []
          const provList = Array.isArray(provBody) ? provBody : (provBody as any)?.providers || []
          if (modelsList.length > 0 && provList.length > 0) {
            hasMicroserviceModels = true
            break
          }
        }
      } catch {
        // ignore and try next URL
      }
    }

    return {
      loggedIn: (await account.state()).status === 'credential-stored',
      hasApiKey: Object.values(states).some(value => record(value) && value.configured === true),
      writable: ref !== undefined && record(states[ref]) && states[ref].writable === true,
      localePreference: localePreference(namespaces),
      hasMicroserviceModels,
    }
  }
  return {
    account,
    read,
    async analyticsEnabled() {
      const enabled = await invoke({ namespace: 'productAnalytics', method: 'enabled', args: {} }, AbortSignal.timeout(1000))
      if (typeof enabled !== 'boolean') throw new Error('desktop analytics: invalid collection policy')
      return enabled
    },
    async report(event) { await invoke({ namespace: 'productAnalytics', method: 'report', args: { event } }, AbortSignal.timeout(1000)) },
    async readLocalePreference() {
      const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
      if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop welcome: missing settings namespaces')
      return localePreference(settings.namespaces)
    },
    async saveSetup(params: AnalogSetupParams): Promise<AnalogSetupResult> {
      try {
        const localChatUrl = 'http://localhost:8071'

        // 1. Initialize local single-tenant user
        await fetch(`${localChatUrl}/v1/users/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'local@analogai.local', name: 'Analog AI Local User' }),
        }).catch((err) => {
          console.warn('User init warning:', err)
        })

        const agentId = 'default'

        // 2. Fetch or create default agent and get API key
        const agentRes = await fetch(`${localChatUrl}/v1/agents/${agentId}`)
        let agentApiKey = ''
        if (agentRes.ok) {
          const agentData = (await agentRes.json()) as { id: string; api_key?: string }
          agentApiKey = agentData.api_key || ''
        } else {
          const createRes = await fetch(`${localChatUrl}/v1/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: 'default',
              name: params.agentName || 'Analog AI Assistant',
              description: 'Local Analog AI Agent with Teacher-Student optimization',
            }),
          })
          if (createRes.ok) {
            const createData = (await createRes.json()) as { id: string; api_key?: string }
            agentApiKey = createData.api_key || ''
          }
        }

        // 3. Attach upstream provider
        const providerRes = await fetch(`${localChatUrl}/v1/agents/${agentId}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: agentId,
            name: params.providerType,
            api_key: params.providerApiKey,
            base_url: params.providerBaseUrl || undefined,
          }),
        })

        if (!providerRes.ok) {
          const errData = await providerRes.json().catch(() => ({}))
          return { ok: false, error: (errData as { detail?: string }).detail || 'Failed to configure provider' }
        }

        const providerData = (await providerRes.json()) as { id: string }
        const providerId = providerData.id

        // 4. Attach Reasoning (Teacher) model
        if (params.reasoningModel) {
          await fetch(`${localChatUrl}/v1/agents/${agentId}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_id: agentId,
              provider_id: providerId,
              name: params.reasoningModel,
              type: 'reasoning',
            }),
          })
        }

        // 5. Attach Fast (Student) model
        if (params.fastModel) {
          await fetch(`${localChatUrl}/v1/agents/${agentId}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_id: agentId,
              provider_id: providerId,
              name: params.fastModel,
              type: 'fast',
            }),
          })
        }

        // 6. Update Harness LLM Settings & credentials
        const { settings, ref } = await settingsAndReference()
        if (ref !== undefined) {
          await invoke({ namespace: 'credentials', method: 'set', args: { ref, value: agentApiKey } })
        }

        await invoke({
          namespace: 'settings',
          method: 'update',
          args: {
            ns: 'llm-deepseek',
            patch: {
              baseURL: 'http://localhost:8071/v1',
            },
          },
        })

        const defaultModelNs = settings.namespaces.find((item: unknown) => record(item) && item.ns === 'agent-default-model')
        if (defaultModelNs !== undefined && params.fastModel) {
          await invoke({
            namespace: 'settings',
            method: 'update',
            args: {
              ns: 'agent-default-model',
              patch: {
                model: params.fastModel,
              },
            },
          }).catch((err) => {
            console.warn('Could not update default model setting:', err)
          })
        }

        return { ok: true }
      } catch (error) {
        console.error('Analog setup failed:', error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    async save(apiKey) {
      if (!/^[\x21-\x7e]+$/.test(apiKey)) return { ok: false }
      try {
        const { ref } = await settingsAndReference()
        if (ref === undefined) return { ok: false }
        await invoke({ namespace: 'credentials', method: 'set', args: { ref, value: apiKey } })
        return { ok: true }
      } catch {
        // Provider diagnostics may contain credentials; the native form owns failure copy.
        return { ok: false }
      }
    },
  }
}
