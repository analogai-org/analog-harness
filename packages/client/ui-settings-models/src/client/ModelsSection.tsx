import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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
  oauth?: boolean
}

const PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyHint: 'sk-...', oauth: true },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', keyHint: 'sk-ant-...' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyHint: 'AIzaSy...' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyHint: 'sk-...' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyHint: 'gsk_...' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', keyHint: '...' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keyHint: '...' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyHint: 'sk-or-...' },
  { id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', keyHint: 'pplx-...' },
  { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.com/v2', keyHint: '...' },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', keyHint: 'fw_...' },
  { id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', keyHint: 'xai-...' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', keyHint: 'csk-...' },
  { id: 'sambanova', name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', keyHint: '...' },
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

export function ModelsSection(_props?: ModelsSectionProps) {
  const [_agents, setAgents] = useState<AgentItem[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string>('default')
  const [providers, setProviders] = useState<ProviderItem[]>([])
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // OpenAI OAuth status
  const [oauthConnected, setOauthConnected] = useState<boolean>(false)
  const oauthPollRef = useRef<any>(null)

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

  const checkOAuthStatus = useCallback(async () => {
    try {
      const res = await fetch(`${CHAT_BASE_URL}/auth/openai/status`)
      if (res.ok) {
        const data = await res.json()
        setOauthConnected(Boolean(data.authenticated || data.has_token || data.logged_in || data.connected))
      }
    } catch {
      // Chat backend may be offline
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
      const provRes = await fetch(`${CHAT_BASE_URL}/v1/agents/${currentAgentId}/providers`)
      if (provRes.ok) {
        const provData = await provRes.json()
        setProviders(Array.isArray(provData) ? provData : provData.providers || [])
      }

      // 3. Fetch models for active agent
      const modRes = await fetch(`${CHAT_BASE_URL}/v1/agents/${currentAgentId}/models`)
      if (modRes.ok) {
        const modData = await modRes.json()
        setModels(Array.isArray(modData) ? modData : modData.models || [])
      }

      // 4. Check OAuth
      await checkOAuthStatus()
    } catch (err: any) {
      setErrorMsg(`Could not connect to Chat backend at ${CHAT_BASE_URL}. Ensure chat service is running.`)
    } finally {
      setLoading(false)
    }
  }, [activeAgentId, checkOAuthStatus])

  useEffect(() => {
    loadData()
  }, [loadData])

  // OAuth polling cleanup
  useEffect(() => {
    return () => {
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    }
  }, [])

  const handleStartOAuth = () => {
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    window.open(
      `${CHAT_BASE_URL}/auth/openai/login?return_to=popup`,
      'OpenAI_OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    )

    if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    oauthPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${CHAT_BASE_URL}/auth/openai/status`)
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated || data.has_token || data.logged_in || data.connected) {
            setOauthConnected(true)
            if (oauthPollRef.current) clearInterval(oauthPollRef.current)
          }
        }
      } catch {}
    }, 2000)
  }

  // --- Provider Modal Actions ---
  const openAddProviderModal = () => {
    setEditingProvider(null)
    setProviderPreset('openai')
    setProviderName('OpenAI')
    setProviderBaseUrl('https://api.openai.com/v1')
    setProviderApiKey('')
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
      setSelectedModelName(modelType === 'reasoning' ? 'gpt-4o' : 'gpt-4o-mini')
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
          Configure AI providers, API keys, OAuth tokens, and choose which models handle complex reasoning vs fast responses.
        </p>
      </div>

      {errorMsg && (
        <div className={styles.diagnosticBanner}>
          {errorMsg}
        </div>
      )}

      {/* BYOK Callout */}
      <div className={styles.byokBanner}>
        <strong>Bring Your Own Key (BYOK):</strong> Your API keys and credentials are stored securely in your local Chat backend.
        Completions are routed directly to your configured providers or via OAuth.
      </div>

      {/* Section 1: Providers Table */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeaderWithSubtitle}>
          <h3 className={styles.sectionTitle}>Providers</h3>
          <p className={styles.sectionSubtitle}>Manage OpenAI, Anthropic, Gemini, DeepSeek, Local (Ollama/vLLM), and other endpoint connections.</p>
        </div>

        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Base URL</th>
                <th className={styles.th}>API Key</th>
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
                providers.map(p => (
                  <tr key={p.id}>
                    <td className={styles.td}>
                      <strong>{p.display_name || p.name}</strong>
                    </td>
                    <td className={`${styles.td} ${styles.tdMonospace}`}>{p.base_url || '-'}</td>
                    <td className={`${styles.td} ${styles.tdMonospace}`}>
                      {p.api_key ? '••••••••••••••••' : '(OAuth / None)'}
                    </td>
                    <td className={`${styles.td} ${styles.actionsCell}`}>
                      <div className={styles.actionButtonGroup}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => openEditProviderModal(p)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => setDeletingProviderId(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Button variant="primary" className={styles.addProviderBtn} onClick={openAddProviderModal}>
          + Add Provider
        </Button>
      </div>

      {/* Section 2: Models Configuration */}
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
              <button
                type="button"
                className={styles.editButton}
                onClick={() => openEditModelModal('reasoning')}
              >
                Edit
              </button>
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
              <button
                type="button"
                className={styles.editButton}
                onClick={() => openEditModelModal('fast')}
              >
                Edit
              </button>
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

            {providerPreset === 'openai' && (
              <div className={styles.oauthCard}>
                <div className={styles.oauthTitle}>OpenAI OAuth Integration</div>
                <div className={styles.oauthText}>
                  You can sign in with your OpenAI account directly without manually generating an API key.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <Button variant="ghost" onClick={handleStartOAuth}>
                    Sign in with OpenAI
                  </Button>
                  <div className={oauthConnected ? styles.oauthStatus : styles.oauthText}>
                    {oauthConnected ? '✓ OAuth Connected' : 'Not signed in'}
                  </div>
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                API Key {providerPreset === 'openai' && oauthConnected && '(Optional when OAuth connected)'}
              </label>
              <input
                className={styles.formInput}
                type="password"
                value={providerApiKey}
                onChange={e => setProviderApiKey(e.target.value)}
                placeholder={PRESETS.find(p => p.id === providerPreset)?.keyHint || 'sk-...'}
              />
              <span className={styles.formHelp}>Your key is securely saved directly in your Chat backend.</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Base URL</label>
              <input
                className={styles.formInput}
                type="text"
                value={providerBaseUrl}
                onChange={e => setProviderBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>

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
                      {p.name} ({p.base_url})
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
              <Button variant="outline" className={styles.btnDanger} onClick={() => deletingProviderId && handleDeleteProvider(deletingProviderId)}>
                Delete Provider
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
