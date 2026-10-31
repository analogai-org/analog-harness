import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

export interface ModelsSectionInjected {
  controller: any
  hooks: any
  operations: any
  schema: any
  t: (key: keyof typeof en, params?: any) => string
}

export type ModelsSectionProps = Partial<ModelsSectionInjected> & {
  useSnapshot?: any
  renderSlot?: ((name: string, props?: any) => ReactNode) | undefined
}

export interface ProviderIdentity {
  provider: string
  displayName: string
}

export function needsSetup(_row: any, anyUsable: boolean): boolean {
  return !anyUsable
}

export function providerTargetLabel(target: ProviderIdentity): string {
  return target.displayName
}

export function providerCopy(template: string, target: ProviderIdentity): string {
  return template.replace(/\{provider\}/g, target.displayName)
}

export async function removeProviderProfile(
  _operations: any,
  _controller: any,
  _target: { settingsNs?: string; settingsPath?: readonly string[]; credentialRef?: string },
): Promise<string | undefined> {
  return undefined
}

interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  keyHint: string
}

const PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyHint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', keyHint: 'sk-ant-...' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: '', keyHint: 'AIzaSy...' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: '', keyHint: 'sk-...' },
  { id: 'groq', name: 'Groq', baseUrl: '', keyHint: 'gsk_...' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: '', keyHint: '...' },
  { id: 'together', name: 'Together AI', baseUrl: '', keyHint: '...' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: '', keyHint: 'sk-or-...' },
  { id: 'perplexity', name: 'Perplexity', baseUrl: '', keyHint: 'pplx-...' },
  { id: 'cohere', name: 'Cohere', baseUrl: '', keyHint: '...' },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: '', keyHint: 'fw_...' },
  { id: 'xai', name: 'xAI (Grok)', baseUrl: '', keyHint: 'xai-...' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: '', keyHint: 'csk-...' },
  { id: 'sambanova', name: 'SambaNova', baseUrl: '', keyHint: '...' },
  { id: 'ollama', name: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1', keyHint: 'None or ollama' },
  { id: 'vllm', name: 'vLLM / Local Server', baseUrl: 'http://localhost:8000/v1', keyHint: 'None or token' },
  { id: 'custom', name: 'Custom OpenAI-Compatible', baseUrl: '', keyHint: '...' },
]

const CHAT_BASE_URL = 'http://localhost:8071'

interface ProviderItem {
  id: string
  agent_id: string
  name: string
  display_name?: string
  base_url?: string
  api_key?: string
  has_key?: boolean
}

interface ModelItem {
  id: string
  agent_id: string
  type?: 'reasoning' | 'fast' | string
  model_type?: 'reasoning' | 'fast' | string
  name?: string
  model_name?: string
  provider_id: string
  max_tokens?: number | null
  max_output_tokens?: number | null
}

interface AgentItem {
  id: string
  name: string
}

interface OAuthStatus {
  connected: boolean
  account_email?: string
  expires_in?: number
  tool?: string
}

function OpenAIIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.597 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.406-.6669zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1636a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813l-.0048 6.7227zm1.1458-1.9776l2.5475-1.4725 2.5476 1.4725v2.9451l-2.5476 1.4725-2.5475-1.4725z" />
    </svg>
  )
}

function AnthropicIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M13.827 3.522h4.296L24 20.478h-4.296l-1.424-3.84H11.53l-1.424 3.84H5.81L11.688 3.522h2.139zm2.864 10.237L14.8 8.441l-1.891 5.318h3.782zM0 20.478l5.879-16.956h4.296L4.296 20.478H0z" />
    </svg>
  )
}

export function ModelsSection(_props?: ModelsSectionProps) {
  const [_agents, setAgents] = useState<AgentItem[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string>('default')
  const [providers, setProviders] = useState<ProviderItem[]>([])
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // OAuth statuses
  const [openAIAuth, setOpenAIAuth] = useState<OAuthStatus | null>(null)
  const [anthropicAuth, setAnthropicAuth] = useState<OAuthStatus | null>(null)
  const [loggingInProvider, setLoggingInProvider] = useState<'openai' | 'anthropic' | null>(null)

  // Provider Modal state
  const [providerModalOpen, setProviderModalOpen] = useState<boolean>(false)
  const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null)
  const [providerPreset, setProviderPreset] = useState<string>('openai')
  const [providerName, setProviderName] = useState<string>('OpenAI')
  const [providerBaseUrl, setProviderBaseUrl] = useState<string>('https://api.openai.com/v1')
  const [providerApiKey, setProviderApiKey] = useState<string>('')
  const [providerSaving, setProviderSaving] = useState<boolean>(false)

  // Model Modal state
  const [modelModalOpen, setModelModalOpen] = useState<boolean>(false)
  const [editingModelType, setEditingModelType] = useState<'reasoning' | 'fast'>('reasoning')
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [selectedModelName, setSelectedModelName] = useState<string>('')
  const [selectedMaxTokens, setSelectedMaxTokens] = useState<string>('')
  const [modelSaving, setModelSaving] = useState<boolean>(false)

  // Delete Provider confirm modal
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)

  const checkAuthStatuses = useCallback(async () => {
    try {
      const [oRes, aRes] = await Promise.all([
        fetch(`${CHAT_BASE_URL}/v1/auth/openai/status`).catch(() => null),
        fetch(`${CHAT_BASE_URL}/v1/auth/anthropic/status`).catch(() => null),
      ])
      if (oRes && oRes.ok) {
        const data = await oRes.json()
        setOpenAIAuth({
          connected: Boolean(data.connected),
          account_email: data.account_email,
          expires_in: data.expires_in,
          tool: data.tool,
        })
      }
      if (aRes && aRes.ok) {
        const data = await aRes.json()
        setAnthropicAuth({
          connected: Boolean(data.connected),
          account_email: data.account_email,
          expires_in: data.expires_in,
          tool: data.tool,
        })
      }
    } catch {
      // ignore
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setErrorMsg(null)

      // 1. Fetch agents
      let currentAgentId = activeAgentId
      const agentRes = await fetch(`${CHAT_BASE_URL}/v1/agents`)
      if (agentRes.ok) {
        const agentData = await agentRes.json()
        const agentList = Array.isArray(agentData) ? agentData : agentData.agents || []
        if (agentList.length > 0) {
          setAgents(agentList)
          if (!agentList.some((a: AgentItem) => a.id === currentAgentId)) {
            currentAgentId = agentList[0].id
            setActiveAgentId(currentAgentId)
          }
        }
      }

      // 2. Fetch providers for active agent
      let loadedProviders: ProviderItem[] = []
      const provRes = await fetch(`${CHAT_BASE_URL}/v1/agents/${currentAgentId}/providers`)
      if (provRes.ok) {
        const provData = await provRes.json()
        loadedProviders = Array.isArray(provData) ? provData : provData.providers || []
        setProviders(loadedProviders)
      }

      // 3. Fetch models for active agent
      let loadedModels: ModelItem[] = []
      const modRes = await fetch(`${CHAT_BASE_URL}/v1/agents/${currentAgentId}/models`)
      if (modRes.ok) {
        const modData = await modRes.json()
        loadedModels = Array.isArray(modData) ? modData : modData.models || []
        setModels(loadedModels)
      }

      // 4. Fetch OAuth status
      void checkAuthStatuses()

      // Sync to localStorage and notify other UI components
      try {
        const configuredList: Array<{ id: string; name: string; provider: string; category?: string }> = []
        for (const m of loadedModels) {
          const p = loadedProviders.find(pr => pr.id === m.provider_id)
          const pName = p ? (p.display_name || p.name) : (m.provider_id || 'custom')
          const mName = m.name || m.model_name || m.id
          if (mName && mName !== 'Not Configured') {
            configuredList.push({
              id: m.id || mName,
              name: mName,
              provider: pName.toLowerCase(),
              category: m.type || m.model_type || 'default',
            })
          }
        }
        localStorage.setItem('analog_configured_models', JSON.stringify(configuredList))
        window.dispatchEvent(new CustomEvent('analog-models-updated'))
      } catch {
        // ignore
      }
    } catch (err: any) {
      setErrorMsg(`Could not connect to Chat backend at ${CHAT_BASE_URL}. Ensure chat service is running.`)
    } finally {
      setLoading(false)
    }
  }, [activeAgentId, checkAuthStatuses])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Listen for OAuth completion messages
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'openai_oauth_success' ||
        event.data?.type === 'anthropic_oauth_success' ||
        event.data?.type === 'oauth_success'
      ) {
        void checkAuthStatuses()
        void loadData()
        setLoggingInProvider(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [checkAuthStatuses, loadData])

  // --- OAuth Login Actions ---
  const handleOAuthLogin = async (pType: 'openai' | 'anthropic') => {
    setLoggingInProvider(pType)
    setErrorMsg(null)
    try {
      await fetch(`${CHAT_BASE_URL}/v1/auth/${pType}/tools/login?agent_id=${activeAgentId}`, {
        method: 'POST',
      }).catch(() => null)

      const loginUrl = `${CHAT_BASE_URL}/v1/auth/${pType}/login?agent_id=${activeAgentId}`
      const popup = window.open(loginUrl, `${pType}_oauth_popup`, 'width=620,height=750,menubar=no,toolbar=no')

      let elapsed = 0
      const interval = setInterval(async () => {
        elapsed += 1000
        try {
          const res = await fetch(`${CHAT_BASE_URL}/v1/auth/${pType}/status`).then(r => r.json()).catch(() => null)
          if (res?.connected) {
            clearInterval(interval)
            setLoggingInProvider(null)
            await checkAuthStatuses()
            await loadData()
            setProviderApiKey(`oauth:${pType}:default`)
            return
          }
        } catch {
          // ignore
        }
        if (elapsed > 45000 || popup?.closed) {
          clearInterval(interval)
          setLoggingInProvider(null)
          await checkAuthStatuses()
          await loadData()
        }
      }, 1000)
    } catch (err: any) {
      setErrorMsg(`Failed to launch ${pType} login: ` + (err?.message || ''))
      setLoggingInProvider(null)
    }
  }

  const handleQuickSetOAuthProvider = async (pType: 'openai' | 'anthropic') => {
    const existing = providers.find(p => p.name.toLowerCase() === pType || p.display_name?.toLowerCase().includes(pType))
    const displayName = pType === 'openai' ? 'OpenAI (Codex)' : 'Anthropic (Claude Code)'
    const payload = {
      name: pType,
      display_name: displayName,
      base_url: pType === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1',
      api_key: `oauth:${pType}:default`,
      agent_id: activeAgentId,
    }

    try {
      if (existing) {
        await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/providers/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Failed to configure ${displayName}: ` + (err?.message || ''))
    }
  }

  // --- Provider Modal Actions ---
  const openAddProviderModal = () => {
    setEditingProvider(null)
    setProviderPreset('openai')
    setProviderName('OpenAI')
    setProviderBaseUrl('https://api.openai.com/v1')
    setProviderApiKey(openAIAuth?.connected ? 'oauth:openai:default' : '')
    setProviderModalOpen(true)
  }

  const openEditProviderModal = (p: ProviderItem) => {
    setEditingProvider(p)
    const match = PRESETS.find(pr => pr.baseUrl === p.base_url || pr.name.toLowerCase() === p.name.toLowerCase())
    setProviderPreset(match ? match.id : 'custom')
    setProviderName(p.display_name || p.name)
    setProviderBaseUrl(p.base_url || '')
    setProviderApiKey(p.api_key || '')
    setProviderModalOpen(true)
  }

  const handlePresetChange = (presetId: string) => {
    setProviderPreset(presetId)
    const match = PRESETS.find(p => p.id === presetId)
    if (match) {
      if (presetId !== 'custom') {
        setProviderName(match.name)
        setProviderBaseUrl(match.baseUrl)
      }
    }
    if (presetId === 'openai' && openAIAuth?.connected && !providerApiKey) {
      setProviderApiKey('oauth:openai:default')
    } else if (presetId === 'anthropic' && anthropicAuth?.connected && !providerApiKey) {
      setProviderApiKey('oauth:anthropic:default')
    }
  }

  const handleSaveProvider = async () => {
    if (!providerName.trim()) return
    try {
      setProviderSaving(true)
      setErrorMsg(null)
      const payload: Record<string, any> = {
        name: providerName.trim(),
        display_name: providerName.trim(),
        base_url: providerBaseUrl.trim() || null,
        api_key: providerApiKey.trim(),
        agent_id: activeAgentId,
      }

      let res: Response
      if (editingProvider) {
        res = await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/providers/${editingProvider.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.detail || 'Failed to save provider.')
        return
      }

      setProviderModalOpen(false)
      await loadData()
    } catch (err: any) {
      setErrorMsg('Failed to save provider: ' + (err?.message || 'Network error'))
    } finally {
      setProviderSaving(false)
    }
  }

  const handleDeleteProvider = async (providerId: string) => {
    try {
      setErrorMsg(null)
      const res = await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/providers/${providerId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.detail || 'Failed to delete provider.')
        return
      }
      setDeletingProviderId(null)
      await loadData()
    } catch (err: any) {
      setErrorMsg('Failed to delete provider: ' + (err?.message || 'Network error'))
    }
  }

  // --- Model Modal Actions ---
  const getModelType = (m: ModelItem) => m.type || m.model_type || ''
  const getModelName = (m?: ModelItem) => m?.name || m?.model_name || 'Not Configured'
  const getModelMaxTokens = (m?: ModelItem) => m?.max_tokens ?? m?.max_output_tokens ?? null

  const openEditModelModal = (modelType: 'reasoning' | 'fast') => {
    setEditingModelType(modelType)
    const existing = models.find(m => getModelType(m) === modelType)
    if (existing) {
      setSelectedProviderId(existing.provider_id || (providers[0]?.id || ''))
      setSelectedModelName(existing.name || existing.model_name || '')
      const maxTok = getModelMaxTokens(existing)
      setSelectedMaxTokens(maxTok ? String(maxTok) : '')
    } else {
      setSelectedProviderId(providers[0]?.id || '')
      setSelectedModelName('')
      setSelectedMaxTokens('')
    }
    setModelModalOpen(true)
  }

  const handleSaveModel = async () => {
    if (!selectedModelName.trim()) return
    try {
      setModelSaving(true)
      setErrorMsg(null)
      const existing = models.find(m => getModelType(m) === editingModelType)
      const maxTokens = selectedMaxTokens.trim() ? parseInt(selectedMaxTokens.trim(), 10) : null
      const payload: Record<string, any> = {
        type: editingModelType,
        model_type: editingModelType,
        name: selectedModelName.trim(),
        model_name: selectedModelName.trim(),
        provider_id: selectedProviderId,
        max_tokens: maxTokens,
        max_output_tokens: maxTokens,
        agent_id: activeAgentId,
      }

      let res: Response
      if (existing) {
        res = await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/models/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`${CHAT_BASE_URL}/v1/agents/${activeAgentId}/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.detail || 'Failed to save model configuration.')
        return
      }

      setModelModalOpen(false)
      await loadData()
    } catch (err: any) {
      setErrorMsg('Failed to save model: ' + (err?.message || 'Network error'))
    } finally {
      setModelSaving(false)
    }
  }

  const reasoningModel = models.find(m => getModelType(m) === 'reasoning')
  const fastModel = models.find(m => getModelType(m) === 'fast')
  const getProviderName = (provId?: string) => {
    if (!provId) return 'None'
    const found = providers.find(p => p.id === provId)
    return found ? (found.display_name || found.name) : 'Unknown'
  }

  return (
    <div className={styles.section}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Models & Providers</h2>
        <p className={styles.pageSubtitle}>
          Configure AI providers, API keys, OAuth subscription logins, and assign reasoning and fast models.
        </p>
      </div>

      {errorMsg && (
        <div className={styles.diagnosticBanner}>
          {errorMsg}
        </div>
      )}

      {/* BYOK & Direct Subscriptions Callout */}
      <div className={styles.byokBanner}>
        <strong>Bring Your Own Key & Subscriptions:</strong> Connect your accounts directly using API keys or log in via OpenAI (ChatGPT Plus/Pro / Codex) and Anthropic (Claude Pro/Max / Claude Code) OAuth subscriptions. Credentials and tokens remain 100% on your local machine.
      </div>

      {/* Section 1: Subscriptions & OAuth Logins */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeaderWithSubtitle}>
          <h3 className={styles.sectionTitle}>Direct Subscriptions & OAuth Login</h3>
          <p className={styles.sectionSubtitle}>
            Sign in with your OpenAI or Anthropic account to use models from your existing Plus, Pro, or Max plans.
          </p>
        </div>

        <div className={styles.oauthGrid}>
          {/* OpenAI / Codex Card */}
          <div className={styles.oauthCard}>
            <div className={styles.oauthHeader}>
              <div className={styles.oauthBrand}>
                <OpenAIIcon style={{ color: '#10a37f' }} />
                <span>OpenAI / Codex</span>
              </div>
              {openAIAuth?.connected ? (
                <span className={styles.oauthStatusBadgeConnected}>
                  <span className={styles.oauthStatusDot} />
                  Connected
                </span>
              ) : (
                <span className={styles.oauthStatusBadgeDisconnected}>
                  <span className={styles.oauthStatusDot} />
                  Not Connected
                </span>
              )}
            </div>

            <p className={styles.oauthText} style={{ margin: 0 }}>
              Use your existing ChatGPT Plus or Pro subscription and Codex CLI integration. Tokens refresh automatically.
            </p>

            <div className={styles.oauthFooter}>
              <div className={styles.oauthEmail} title={openAIAuth?.account_email || ''}>
                {openAIAuth?.connected ? (openAIAuth.account_email || 'Subscription Active') : 'No API key required'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {openAIAuth?.connected && (
                  <Button
                    variant="ghost"
                    onClick={() => handleQuickSetOAuthProvider('openai')}
                    title="Ensure this provider is active in the table below"
                  >
                    Set as Provider
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => handleOAuthLogin('openai')}
                  disabled={loggingInProvider === 'openai'}
                >
                  {loggingInProvider === 'openai'
                    ? 'Signing in...'
                    : openAIAuth?.connected
                      ? 'Switch Account'
                      : 'Sign in with OpenAI'}
                </Button>
              </div>
            </div>
          </div>

          {/* Anthropic / Claude Code Card */}
          <div className={styles.oauthCard}>
            <div className={styles.oauthHeader}>
              <div className={styles.oauthBrand}>
                <AnthropicIcon style={{ color: '#f59e0b' }} />
                <span>Anthropic / Claude Code</span>
              </div>
              {anthropicAuth?.connected ? (
                <span className={styles.oauthStatusBadgeConnectedAnthropic}>
                  <span className={styles.oauthStatusDot} />
                  Connected
                </span>
              ) : (
                <span className={styles.oauthStatusBadgeDisconnected}>
                  <span className={styles.oauthStatusDot} />
                  Not Connected
                </span>
              )}
            </div>

            <p className={styles.oauthText} style={{ margin: 0 }}>
              Use your existing Claude Pro or Max subscription and Claude Code CLI integration. Tokens refresh automatically.
            </p>

            <div className={styles.oauthFooter}>
              <div className={styles.oauthEmail} title={anthropicAuth?.account_email || ''}>
                {anthropicAuth?.connected ? (anthropicAuth.account_email || 'Subscription Active') : 'No API key required'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {anthropicAuth?.connected && (
                  <Button
                    variant="ghost"
                    onClick={() => handleQuickSetOAuthProvider('anthropic')}
                    title="Ensure this provider is active in the table below"
                  >
                    Set as Provider
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => handleOAuthLogin('anthropic')}
                  disabled={loggingInProvider === 'anthropic'}
                >
                  {loggingInProvider === 'anthropic'
                    ? 'Signing in...'
                    : anthropicAuth?.connected
                      ? 'Switch Account'
                      : 'Sign in with Anthropic'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Providers Table */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeaderWithSubtitle}>
          <h3 className={styles.sectionTitle}>Configured Providers</h3>
          <p className={styles.sectionSubtitle}>Active endpoint connections and API keys for this agent.</p>
        </div>

        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Base URL</th>
                <th className={styles.th}>Authentication</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    {loading ? 'Loading providers...' : 'No providers configured yet. Click "+ Add Provider" below.'}
                  </td>
                </tr>
              ) : (
                providers.map(p => {
                  const isOAuthKey = p.api_key?.startsWith('oauth:')
                  return (
                    <tr key={p.id}>
                      <td className={styles.td}>
                        <strong>{p.display_name || p.name}</strong>
                      </td>
                      <td className={`${styles.td} ${styles.tdMonospace}`}>{p.base_url || '-'}</td>
                      <td className={`${styles.td} ${styles.tdMonospace}`}>
                        {isOAuthKey ? (
                          <span style={{ color: p.name.toLowerCase() === 'openai' ? '#10a37f' : '#f59e0b', fontWeight: 500 }}>
                            OAuth Subscription
                          </span>
                        ) : p.api_key ? (
                          '••••••••••••••••'
                        ) : (
                          '(None / Local)'
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.actionsCell}`}>
                        <div className={styles.actionButtonGroup}>
                          <Button
                            variant="outline"
                            onClick={() => openEditProviderModal(p)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className={styles.deleteButton}
                            onClick={() => setDeletingProviderId(p.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Button variant="primary" className={styles.addProviderBtn} onClick={openAddProviderModal}>
          + Add Provider
        </Button>
      </div>

      {/* Section 3: Models Configuration */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeaderWithSubtitle}>
          <h3 className={styles.sectionTitle}>Models</h3>
          <p className={styles.sectionSubtitle}>Assign models and tokens for deep reasoning and fast interactive replies.</p>
        </div>

        <div className={styles.modelsGrid}>
          {/* Reasoning Model Card */}
          <div className={styles.modelCard}>
            <div className={styles.cardHeader}>
              <span className={styles.badge}>Reasoning Model</span>
              <Button
                variant="outline"
                onClick={() => openEditModelModal('reasoning')}
              >
                Edit
              </Button>
            </div>
            <div className={styles.modelVal}>
              {getModelName(reasoningModel)}
            </div>
            <div className={styles.modelProv}>
              Provider: <strong>{getProviderName(reasoningModel?.provider_id)}</strong>
            </div>
            {getModelMaxTokens(reasoningModel) && (
              <div className={styles.modelMaxTokens}>
                Max tokens: {getModelMaxTokens(reasoningModel)}
              </div>
            )}
            <div className={styles.cardDesc}>
              Used for complex tasks, architectural decisions, code planning, and multi-step tool reasoning.
            </div>
          </div>

          {/* Fast Model Card */}
          <div className={styles.modelCard}>
            <div className={styles.cardHeader}>
              <span className={styles.badge}>Fast Model</span>
              <Button
                variant="outline"
                onClick={() => openEditModelModal('fast')}
              >
                Edit
              </Button>
            </div>
            <div className={styles.modelVal}>
              {getModelName(fastModel)}
            </div>
            <div className={styles.modelProv}>
              Provider: <strong>{getProviderName(fastModel?.provider_id)}</strong>
            </div>
            {getModelMaxTokens(fastModel) && (
              <div className={styles.modelMaxTokens}>
                Max tokens: {getModelMaxTokens(fastModel)}
              </div>
            )}
            <div className={styles.cardDesc}>
              Used for quick responses, titles, summarization, and lightweight conversational turns.
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Provider Modal */}
      {providerModalOpen && (
        <Modal
          open={providerModalOpen}
          closeLabel="Close"
          title={editingProvider ? 'Edit Provider' : 'Add Provider'}
          onClose={() => setProviderModalOpen(false)}
        >
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Provider Preset</label>
              <select
                className={styles.formSelect}
                value={providerPreset}
                onChange={e => handlePresetChange(e.target.value)}
              >
                {PRESETS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* In-Modal OpenAI OAuth helper */}
            {providerPreset === 'openai' && (
              <div className={styles.modalOAuthBoxOpenAI}>
                <div className={styles.modalOAuthRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#10a37f', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <OpenAIIcon style={{ color: '#10a37f' }} />
                      <span>Use OpenAI / ChatGPT Subscription</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 }}>
                      {openAIAuth?.connected
                        ? `Connected (${openAIAuth.account_email || 'Account active'}). Tokens auto-refresh.`
                        : 'Sign in to use your Plus/Pro plan and Codex CLI without an API key.'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleOAuthLogin('openai')
                      setProviderApiKey('oauth:openai:default')
                    }}
                    disabled={loggingInProvider === 'openai'}
                  >
                    {openAIAuth?.connected ? 'Reconnect' : 'Sign in with OpenAI'}
                  </Button>
                </div>
              </div>
            )}

            {/* In-Modal Anthropic OAuth helper */}
            {providerPreset === 'anthropic' && (
              <div className={styles.modalOAuthBoxAnthropic}>
                <div className={styles.modalOAuthRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AnthropicIcon style={{ color: '#f59e0b' }} />
                      <span>Use Anthropic / Claude Code</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 }}>
                      {anthropicAuth?.connected
                        ? `Connected (${anthropicAuth.account_email || 'Account active'}). Tokens auto-refresh.`
                        : 'Sign in to use your Claude Pro/Max plan and Claude Code CLI without an API key.'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleOAuthLogin('anthropic')
                      setProviderApiKey('oauth:anthropic:default')
                    }}
                    disabled={loggingInProvider === 'anthropic'}
                  >
                    {anthropicAuth?.connected ? 'Reconnect' : 'Sign in with Anthropic'}
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Display Name</label>
              <input
                className={styles.formInput}
                type="text"
                value={providerName}
                onChange={e => setProviderName(e.target.value)}
                placeholder="e.g. OpenAI, Anthropic, My Local LLM"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>API Key</label>
              <input
                className={styles.formInput}
                type="password"
                value={providerApiKey}
                onChange={e => setProviderApiKey(e.target.value)}
                placeholder={PRESETS.find(p => p.id === providerPreset)?.keyHint || 'sk-...'}
              />
              <span className={styles.formHelp}>
                {providerApiKey.startsWith('oauth:')
                  ? 'Using OAuth subscription token credentials.'
                  : 'Your API key is securely saved directly in your Chat backend.'}
              </span>
            </div>

            {(providerPreset === 'custom' || providerPreset === 'ollama' || providerPreset === 'vllm') && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Base URL</label>
                <input
                  className={styles.formInput}
                  type="text"
                  value={providerBaseUrl}
                  onChange={e => setProviderBaseUrl(e.target.value)}
                  placeholder={providerPreset === 'ollama' ? 'http://localhost:11434/v1' : 'https://...'}
                />
              </div>
            )}

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setProviderModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveProvider} disabled={providerSaving}>
                {providerSaving ? 'Saving...' : 'Save Provider'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Model Modal */}
      {modelModalOpen && (
        <Modal
          open={modelModalOpen}
          closeLabel="Close"
          title={`Edit ${editingModelType === 'reasoning' ? 'Reasoning' : 'Fast'} Model`}
          onClose={() => setModelModalOpen(false)}
        >
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Provider</label>
              <select
                className={styles.formSelect}
                value={selectedProviderId}
                onChange={e => setSelectedProviderId(e.target.value)}
              >
                {providers.length === 0 ? (
                  <option value="">No providers available</option>
                ) : (
                  providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || p.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Model Name / ID</label>
              <input
                className={styles.formInput}
                type="text"
                value={selectedModelName}
                onChange={e => setSelectedModelName(e.target.value)}
                placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022, deepseek-reasoner"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Max Output Tokens (Optional)</label>
              <input
                className={styles.formInput}
                type="number"
                value={selectedMaxTokens}
                onChange={e => setSelectedMaxTokens(e.target.value)}
                placeholder="e.g. 4096 (leave empty for default)"
              />
            </div>

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setModelModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveModel} disabled={modelSaving}>
                {modelSaving ? 'Saving...' : 'Save Model'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Provider Confirmation Modal */}
      {Boolean(deletingProviderId) && (
        <Modal
          open={Boolean(deletingProviderId)}
          closeLabel="Close"
          title="Delete Provider"
          onClose={() => setDeletingProviderId(null)}
        >
          <div className={styles.modalBody}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
              Are you sure you want to delete this provider? Any models currently using this provider may stop functioning.
            </p>
            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setDeletingProviderId(null)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => deletingProviderId && handleDeleteProvider(deletingProviderId)}>
                Delete Provider
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
