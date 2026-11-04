/** Desktop welcome presentation; Minimalist 2-step Analog AI onboarding wizard using DeepSeek UI design. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import type { WelcomeApi, AnalogSetupParams } from '../welcome-api.ts'

interface ProviderPreset {
  name: string
  baseUrl: string
  teacherModel: string
  studentModel: string
  keyRequired: boolean
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

const CHAT_BASE_URL = 'http://localhost:8071'

const DEFAULT_WELCOME_PRESETS: Record<string, ProviderPreset> = {
  openai_oauth: {
    name: 'OpenAI Subscription (Codex)',
    baseUrl: 'https://api.openai.com/v1',
    teacherModel: 'o3-mini',
    studentModel: 'gpt-4o-mini',
    keyRequired: false,
  },
  anthropic_oauth: {
    name: 'Anthropic Subscription (Claude Code)',
    baseUrl: 'https://api.anthropic.com/v1',
    teacherModel: 'claude-3-7-sonnet-20250219',
    studentModel: 'claude-3-5-haiku-20241022',
    keyRequired: false,
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    teacherModel: 'o3-mini',
    studentModel: 'gpt-4o-mini',
    keyRequired: true,
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    teacherModel: 'claude-3-7-sonnet-20250219',
    studentModel: 'claude-3-5-haiku-20241022',
    keyRequired: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    teacherModel: 'deepseek-r1:14b',
    studentModel: 'qwen2.5-coder:7b',
    keyRequired: false,
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    teacherModel: 'gemini-2.0-flash-thinking-exp',
    studentModel: 'gemini-2.0-flash',
    keyRequired: true,
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    teacherModel: 'deepseek-reasoner',
    studentModel: 'deepseek-chat',
    keyRequired: true,
  },
  grok: {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    teacherModel: 'grok-2-mini',
    studentModel: 'grok-2-mini',
    keyRequired: true,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    teacherModel: 'deepseek/deepseek-r1',
    studentModel: 'meta-llama/llama-3.3-70b-instruct',
    keyRequired: true,
  },
  vllm: {
    name: 'vLLM / Local OpenAI compatible',
    baseUrl: 'http://localhost:8000/v1',
    teacherModel: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    studentModel: 'Qwen/Qwen2.5-Coder-7B-Instruct',
    keyRequired: false,
  },
  custom: {
    name: 'Custom Provider',
    baseUrl: '',
    teacherModel: '',
    studentModel: '',
    keyRequired: false,
  },
}

export function Welcome({ api }: { api: WelcomeApi }) {
  // Step 0: Welcome overview with "Start Configuration" button
  // Step 1: Add Providers
  // Step 2: Add Teacher & Student models
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [providers, setProviders] = useState<Record<string, ProviderPreset>>(DEFAULT_WELCOME_PRESETS)
  const [providerType, setProviderType] = useState('openai_oauth')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_WELCOME_PRESETS.openai_oauth.baseUrl)
  const [teacherModel, setTeacherModel] = useState(DEFAULT_WELCOME_PRESETS.openai_oauth.teacherModel)
  const [studentModel, setStudentModel] = useState(DEFAULT_WELCOME_PRESETS.openai_oauth.studentModel)

  // OAuth statuses
  const [openAIAuth, setOpenAIAuth] = useState<OAuthStatus | null>(null)
  const [anthropicAuth, setAnthropicAuth] = useState<OAuthStatus | null>(null)
  const [loggingInProvider, setLoggingInProvider] = useState<'openai' | 'anthropic' | null>(null)

  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const checkAuthStatuses = async () => {
    try {
      const [oRes, aRes] = await Promise.all([
        fetch(`${CHAT_BASE_URL}/v1/auth/openai/status`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
        fetch(`${CHAT_BASE_URL}/v1/auth/anthropic/status`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
      ])
      if (mounted.current && oRes && oRes.ok) {
        const data = await oRes.json()
        setOpenAIAuth({
          connected: Boolean(data.connected),
          account_email: data.account_email,
          expires_in: data.expires_in,
          tool: data.tool,
        })
      }
      if (mounted.current && aRes && aRes.ok) {
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
  }

  useEffect(() => {
    mounted.current = true
    document.title = 'Analog AI Harness Setup'

    void checkAuthStatuses()

    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'openai_oauth_success' ||
        event.data?.type === 'anthropic_oauth_success' ||
        event.data?.type === 'oauth_success'
      ) {
        void checkAuthStatuses()
        setLoggingInProvider(null)
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      mounted.current = false
      window.removeEventListener('message', onMessage)
    }
  }, [providerType])

  const handleOAuthLogin = async (pType: 'openai' | 'anthropic') => {
    setLoggingInProvider(pType)
    setError('')
    try {
      await fetch(`${CHAT_BASE_URL}/v1/auth/${pType}/tools/login?agent_id=default`, {
        method: 'POST',
      }).catch(() => null)

      const loginUrl = `${CHAT_BASE_URL}/v1/auth/${pType}/login?agent_id=default`
      const popup = window.open(loginUrl, `${pType}_oauth_popup`, 'width=620,height=750,menubar=no,toolbar=no')

      let elapsed = 0
      const interval = setInterval(async () => {
        elapsed += 1000
        try {
          const res = await fetch(`${CHAT_BASE_URL}/v1/auth/${pType}/status`).then((r) => r.json()).catch(() => null)
          if (res?.connected) {
            clearInterval(interval)
            setLoggingInProvider(null)
            await checkAuthStatuses()
            return
          }
        } catch {
          // ignore
        }
        if (elapsed > 45000 || popup?.closed) {
          clearInterval(interval)
          setLoggingInProvider(null)
          await checkAuthStatuses()
        }
      }, 1000)
    } catch (err: unknown) {
      setError(`Failed to launch ${pType} login: ${err instanceof Error ? err.message : String(err)}`)
      setLoggingInProvider(null)
    }
  }

  function handleProviderChange(type: string) {
    setProviderType(type)
    const preset = providers[type]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      if (preset.teacherModel) setTeacherModel(preset.teacherModel)
      if (preset.studentModel) setStudentModel(preset.studentModel)
    }
    setError('')
    if (type === 'openai_oauth' || type === 'anthropic_oauth' || type === 'openai' || type === 'anthropic') {
      void checkAuthStatuses()
    }
  }

  function handleStep1Next() {
    if (Object.keys(providers).length === 0) {
      setError('Chat microservice is unavailable. Please ensure the service is running.')
      return
    }

    const preset = providers[providerType]
    const isOpenAIOAuth = providerType === 'openai_oauth'
    const isAnthropicOAuth = providerType === 'anthropic_oauth'

    if (isOpenAIOAuth) {
      if (!openAIAuth?.connected) {
        setError('Please sign in with OpenAI before continuing.')
        return
      }
    } else if (isAnthropicOAuth) {
      if (!anthropicAuth?.connected) {
        setError('Please sign in with Anthropic before continuing.')
        return
      }
    } else {
      const keyRequired = preset ? preset.keyRequired : true
      if (keyRequired && !apiKey.trim()) {
        setError(`Please provide an API key for ${preset?.name ?? providerType}`)
        return
      }

      if ((providerType === 'custom' || providerType === 'ollama') && !baseUrl.trim()) {
        setError('Please provide a Base URL for your provider.')
        return
      }
    }

    setError('')
    setStep(2)
  }

  async function handleSubmit(event?: FormEvent) {
    if (event) event.preventDefault()
    if (busy) return

    if (!teacherModel.trim()) {
      setError('Please specify a Teacher (Reasoning) model.')
      return
    }

    if (!studentModel.trim()) {
      setError('Please specify a Student (Fast) model.')
      return
    }

    setBusy(true)
    setError('')
    setStatusMessage('Configuring Analog AI distillation proxy...')

    const effectiveApiKey =
      providerType === 'openai_oauth'
        ? 'oauth:openai:default'
        : providerType === 'anthropic_oauth'
          ? 'oauth:anthropic:default'
          : apiKey.trim()

    const effectiveProviderType =
      providerType === 'openai_oauth'
        ? 'openai'
        : providerType === 'anthropic_oauth'
          ? 'anthropic'
          : providerType

    const params: AnalogSetupParams = {
      providerType: effectiveProviderType,
      providerApiKey: effectiveApiKey,
      providerBaseUrl: baseUrl.trim() || undefined,
      reasoningModel: teacherModel.trim(),
      fastModel: studentModel.trim(),
      agentName: 'Analog Assistant',
    }

    try {
      const result = await api.saveSetup(params)
      if (!mounted.current) return
      if (!result.ok) {
        setError(result.error ?? 'Failed to complete Analog AI setup. Please verify the local server.')
        setBusy(false)
        setStatusMessage('')
      }
    } catch (err: unknown) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred during setup.')
        setBusy(false)
        setStatusMessage('')
      }
    }
  }

  async function handleSkip() {
    if (busy) return
    setBusy(true)
    try {
      await api.skip()
    } catch {
      if (mounted.current) {
        setError('Failed to skip setup.')
        setBusy(false)
      }
    }
  }

  const selectedPreset = providers[providerType]
  const isOpenAIOAuth = providerType === 'openai_oauth'
  const isAnthropicOAuth = providerType === 'anthropic_oauth'
  const isOAuthProvider = isOpenAIOAuth || isAnthropicOAuth
  const showBaseUrl = providerType === 'custom' || providerType === 'ollama'

  return (
    <>
      <div className="titlebar" aria-hidden="true" />
      <main className="welcome">
        <img className="brand" src="assets/analog-logo.png" alt="Analog AI" />

        {/* STEP 0: ENTRY */}
        {step === 0 && (
          <>
            <div id="tagline" className="tagline">
              <h1 id="welcome-heading">
                <span>Welcome to </span>
                <em>Analog AI</em>
                <span> Harness</span>
              </h1>
              <p id="welcome-description">
                Harness for reasoning & executor agents
              </p>
            </div>

            <div id="entry-actions" className="actions">
              <button
                id="start-config-btn"
                className="primary"
                type="button"
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                Start Configuration
              </button>
              <button
                id="skip-config-btn"
                className="secondary"
                type="button"
                onClick={() => {
                  void handleSkip()
                }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* STEP 1: PROVIDER SETUP */}
        {step === 1 && (
          <>
            <div className="key-form">
              <header className="key-heading">
                <h1>Step 1 of 2: Model Provider</h1>
                <p>Choose your provider and configure credentials</p>
              </header>

              {loadingProviders ? (
                <div className="key-field" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <StateDot state="ongoing" size={14} />
                    <p style={{ opacity: 0.8, fontSize: '0.95rem', margin: 0 }}>
                      Connecting to Analog AI service...
                    </p>
                  </div>
                </div>
              ) : serviceError || Object.keys(providers).length === 0 ? (
                <div className="key-field" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <p className="key-error" role="alert" style={{ marginBottom: '1rem' }}>
                    {serviceError || 'Chat microservice is unavailable. Unable to load providers.'}
                  </p>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setLoadingProviders(true)
                      setServiceError('')
                      setError('')
                      retryCount.current = 0
                      void fetchProviders()
                    }}
                  >
                    Retry Connection
                  </button>
                </div>
              ) : (
                <>
                  <div className="key-field">
                    <label htmlFor="provider-select">Provider</label>
                    <select
                      id="provider-select"
                      value={providerType}
                      disabled={busy}
                      onChange={(e) => handleProviderChange(e.target.value)}
                    >
                      {Object.entries(providers).map(([key, val]) => (
                        <option key={key} value={key}>
                          {val.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* OpenAI OAuth Card */}
                  {isOpenAIOAuth && (
                    <div className="openai-subscription-card">
                      <div className="openai-subscription-header">
                        <div className="openai-subscription-title">
                          <OpenAIIcon style={{ color: '#10a37f' }} />
                          <span>OpenAI / ChatGPT Subscription (Codex)</span>
                        </div>
                        <button
                          type="button"
                          className="openai-login-btn"
                          disabled={busy || loggingInProvider === 'openai'}
                          onClick={() => { void handleOAuthLogin('openai') }}
                        >
                          {openAIAuth?.connected ? 'Reconnect' : 'Sign in with OpenAI'}
                        </button>
                      </div>
                      {openAIAuth?.connected ? (
                        <div className="openai-connected-status">
                          <span>✓ Connected: {openAIAuth.account_email || 'Account active'}</span>
                        </div>
                      ) : (
                        <p className="openai-desc">
                          Sign in to authenticate directly with your OpenAI account. No API key required.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Anthropic OAuth Card */}
                  {isAnthropicOAuth && (
                    <div className="anthropic-subscription-card">
                      <div className="anthropic-subscription-header">
                        <div className="anthropic-subscription-title">
                          <AnthropicIcon style={{ color: '#f59e0b' }} />
                          <span>Anthropic / Claude Subscription (Claude Code)</span>
                        </div>
                        <button
                          type="button"
                          className="anthropic-login-btn"
                          disabled={busy || loggingInProvider === 'anthropic'}
                          onClick={() => { void handleOAuthLogin('anthropic') }}
                        >
                          {anthropicAuth?.connected ? 'Reconnect' : 'Sign in with Anthropic'}
                        </button>
                      </div>
                      {anthropicAuth?.connected ? (
                        <div className="anthropic-connected-status">
                          <span>✓ Connected: {anthropicAuth.account_email || 'Account active'}</span>
                        </div>
                      ) : (
                        <p className="anthropic-desc">
                          Sign in to authenticate directly with your Anthropic account. No API key required.
                        </p>
                      )}
                    </div>
                  )}
                          type="button"
                          className="openai-login-btn"
                          disabled={busy || loggingInProvider === 'openai'}
                          onClick={() => { void handleOAuthLogin('openai') }}
                        >
                          {openAIAuth?.connected ? 'Reconnect' : 'Sign in with OpenAI'}
                        </button>
                      </div>
                      {openAIAuth?.connected ? (
                        <div className="openai-connected-status">
                          <span>✓ Connected: {openAIAuth.account_email || 'Account active'}</span>
                        </div>
                      ) : (
                        <p className="openai-desc">
                          Sign in to authenticate directly with your OpenAI account. No API key required.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Anthropic OAuth Card */}
                  {isAnthropic && (
                    <div className="anthropic-subscription-card">
                      <div className="anthropic-subscription-header">
                        <div className="anthropic-subscription-title">
                          <AnthropicIcon style={{ color: '#f59e0b' }} />
                          <span>Anthropic / Claude Subscription</span>
                        </div>
                        <button
                          type="button"
                          className="anthropic-login-btn"
                          disabled={busy || loggingInProvider === 'anthropic'}
                          onClick={() => { void handleOAuthLogin('anthropic') }}
                        >
                          {anthropicAuth?.connected ? 'Reconnect' : 'Sign in with Anthropic'}
                        </button>
                      </div>
                      {anthropicAuth?.connected ? (
                        <div className="anthropic-connected-status">
                          <span>✓ Connected: {anthropicAuth.account_email || 'Account active'}</span>
                        </div>
                      ) : (
                        <p className="anthropic-desc">
                          Sign in to authenticate directly with your Anthropic account. No API key required.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Standard API Key / Base URL for other providers */}
                  {!isOAuthProvider && (
                    <>
                      <div className="key-field">
                        <label htmlFor="key-input">
                          {!selectedPreset?.keyRequired || providerType === 'ollama' || providerType === 'vllm'
                            ? 'API Key (Not required for local servers)'
                            : 'API Key'}
                        </label>
                        <input
                          id="key-input"
                          type="password"
                          autoComplete="new-password"
                          autoCapitalize="off"
                          spellCheck={false}
                          placeholder={
                            !selectedPreset?.keyRequired || providerType === 'ollama' || providerType === 'vllm'
                              ? 'Leave empty for local default or enter key'
                              : 'Enter your API key...'
                          }
                          value={apiKey}
                          disabled={busy}
                          onChange={(e) => {
                            setApiKey(e.target.value)
                            setError('')
                          }}
                          autoFocus
                        />
                      </div>

                      {showBaseUrl && (
                        <div className="key-field">
                          <label htmlFor="base-url-input">Base URL</label>
                          <input
                            id="base-url-input"
                            type="text"
                            placeholder="e.g. http://localhost:11434"
                            value={baseUrl}
                            disabled={busy}
                            onChange={(e) => {
                              setBaseUrl(e.target.value)
                              setError('')
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {error && (
                <p className="key-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="actions">
              <button
                id="step1-next-btn"
                className="primary"
                type="button"
                disabled={busy || loadingProviders || Object.keys(providers).length === 0}
                onClick={handleStep1Next}
              >
                Next
              </button>
              <button
                id="step1-back-btn"
                className="back"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep(0)
                }}
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* STEP 2: DISTILLATION MODELS */}
        {step === 2 && (
          <>
            <form className="key-form" onSubmit={(e) => { void handleSubmit(e) }}>
              <header className="key-heading">
                <h1>Step 2 of 2: Distillation Models</h1>
                <p>Configure Teacher (reasoning) & Student (fast executor) models</p>
              </header>

              <div className="key-field">
                <label htmlFor="teacher-model-input">Teacher Model (Reasoning)</label>
                <input
                  id="teacher-model-input"
                  type="text"
                  placeholder="e.g. deepseek-reasoner"
                  value={teacherModel}
                  disabled={busy}
                  onChange={(e) => {
                    setTeacherModel(e.target.value)
                    setError('')
                  }}
                  autoFocus
                />
              </div>

              <div className="key-field">
                <label htmlFor="student-model-input">Student Model (Fast Executor)</label>
                <input
                  id="student-model-input"
                  type="text"
                  placeholder="e.g. deepseek-chat"
                  value={studentModel}
                  disabled={busy}
                  onChange={(e) => {
                    setStudentModel(e.target.value)
                    setError('')
                  }}
                />
              </div>

              {error && (
                <p className="key-error" role="alert">
                  {error}
                </p>
              )}

              {busy && (
                <div className="key-status">
                  <StateDot state="ongoing" size={14} />
                  <span>{statusMessage}</span>
                </div>
              )}
            </form>

            <div className="actions">
              <button
                id="finish-btn"
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => { void handleSubmit() }}
              >
                {busy ? <StateDot state="ongoing" size={16} /> : 'Launch Harness'}
              </button>
              <button
                id="step2-back-btn"
                className="back"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </main>
    </>
  )
}
