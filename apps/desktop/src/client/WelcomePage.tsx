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

export function Welcome({ api }: { api: WelcomeApi }) {
  // Step 0: Welcome overview with "Start Configuration" button
  // Step 1: Add Providers
  // Step 2: Add Teacher & Student models
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [providers, setProviders] = useState<Record<string, ProviderPreset>>({})
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [serviceError, setServiceError] = useState('')

  const [providerType, setProviderType] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [teacherModel, setTeacherModel] = useState('')
  const [studentModel, setStudentModel] = useState('')

  const [authStatus, setAuthStatus] = useState<{
    connected: boolean
    accountEmail?: string | null
    tool?: { supported?: boolean; tool_id?: string; tool_name?: string; installed?: boolean; path?: string | null }
  } | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const retryCount = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const authPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const checkProviderAuth = async (pType: string) => {
    if (pType !== 'openai' && pType !== 'anthropic') {
      setAuthStatus(null)
      return
    }
    setCheckingAuth(true)
    try {
      const res = await fetch(`http://localhost:8071/v1/auth/${pType}/status`, {
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)
      if (res && res.ok) {
        const data = await res.json()
        if (mounted.current) {
          setAuthStatus({
            connected: Boolean(data.connected),
            accountEmail: data.account_email,
            tool: data.tool,
          })
          if (data.connected && !apiKey) {
            setApiKey(`oauth:${pType}:default`)
          }
        }
      }
    } catch {
      // Ignore background auth check failures
    } finally {
      if (mounted.current) {
        setCheckingAuth(false)
      }
    }
  }

  const handleOAuthLogin = async () => {
    if (providerType !== 'openai' && providerType !== 'anthropic') return
    setLoggingIn(true)
    setError('')

    try {
      // First ensure companion CLI tool is checked/installed via chat microservice
      await fetch(`http://localhost:8071/v1/auth/${providerType}/tools/login?agent_id=default`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)

      const loginUrl = `http://localhost:8071/v1/auth/${providerType}/login?agent_id=default`
      const popup = window.open(loginUrl, `${providerType}_oauth`, 'width=620,height=750,menubar=no,toolbar=no')

      if (authPollRef.current) clearInterval(authPollRef.current)
      let elapsed = 0
      authPollRef.current = setInterval(() => {
        elapsed += 1500
        void checkProviderAuth(providerType)
        if (elapsed > 120000 || popup?.closed) {
          if (authPollRef.current) clearInterval(authPollRef.current)
          if (mounted.current) setLoggingIn(false)
        }
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch OAuth login')
      setLoggingIn(false)
    }
  }

  const fetchProviders = async () => {
    try {
      let res = await fetch('http://localhost:8071/available-providers', {
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)
      if (!res || !res.ok) {
        res = await fetch('http://localhost:8071/v1/available-providers', {
          signal: AbortSignal.timeout(3000),
        }).catch(() => null)
      }
      if (res && res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.providers) && data.providers.length > 0) {
          const map: Record<string, ProviderPreset> = {}
          for (const p of data.providers) {
            map[p.id] = {
              name: p.name,
              baseUrl: p.baseUrl || p.base_url || '',
              teacherModel: p.teacherModel || p.teacher_model || '',
              studentModel: p.studentModel || p.student_model || '',
              keyRequired: p.keyRequired ?? p.key_required ?? true,
            }
          }
          if (mounted.current) {
            setProviders(map)
            setLoadingProviders(false)
            setServiceError('')
            setProviderType((prev) => {
              const nextType = map[prev] ? prev : data.providers[0].id
              const active = map[nextType]
              if (active) {
                setBaseUrl((b) => b || active.baseUrl)
                setTeacherModel((t) => t || active.teacherModel)
                setStudentModel((s) => s || active.studentModel)
              }
              void checkProviderAuth(nextType)
              return nextType
            })
            return // Successfully retrieved providers, stop polling
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch available providers from microservice:', err)
    }

    // Retry if microservice is still starting up
    if (mounted.current) {
      retryCount.current += 1
      if (retryCount.current > 10) {
        setLoadingProviders(false)
        setServiceError(
          'Chat microservice is unavailable or unreachable on port 8071. Please ensure the backend is started.',
        )
      } else {
        pollTimerRef.current = setTimeout(() => {
          void fetchProviders()
        }, 1500)
      }
    }
  }

  useEffect(() => {
    mounted.current = true
    document.title = 'Analog AI Harness Setup'

    void fetchProviders()

    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'openai_oauth_success' ||
        event.data?.type === 'anthropic_oauth_success' ||
        event.data?.type === 'oauth_success'
      ) {
        if (mounted.current && providerType) {
          void checkProviderAuth(providerType)
          setLoggingIn(false)
        }
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      mounted.current = false
      window.removeEventListener('message', onMessage)
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (authPollRef.current) clearInterval(authPollRef.current)
    }
  }, [providerType])

  function handleProviderChange(type: string) {
    setProviderType(type)
    const preset = providers[type]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      if (preset.teacherModel) setTeacherModel(preset.teacherModel)
      if (preset.studentModel) setStudentModel(preset.studentModel)
    }
    setError('')
    void checkProviderAuth(type)
  }

  function handleStep1Next() {
    if (Object.keys(providers).length === 0) {
      setError('Chat microservice is unavailable. Please ensure the service is running.')
      return
    }

    const preset = providers[providerType]
    const keyRequired = preset ? preset.keyRequired : true
    const isOAuthConnected = (providerType === 'openai' || providerType === 'anthropic') && Boolean(authStatus?.connected)

    if (keyRequired && !apiKey.trim() && !isOAuthConnected) {
      setError(`Please provide an API key or sign in with ${preset?.name ?? providerType}`)
      return
    }

    if ((providerType === 'custom' || providerType === 'ollama') && !baseUrl.trim()) {
      setError('Please provide a Base URL for your provider.')
      return
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

    const isOAuthConnected = (providerType === 'openai' || providerType === 'anthropic') && Boolean(authStatus?.connected)
    const effectiveApiKey = isOAuthConnected && !apiKey.trim() ? `oauth:${providerType}:default` : apiKey.trim()

    const params: AnalogSetupParams = {
      providerType,
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
                <p>Choose your provider and configure API credentials</p>
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

                  {(providerType === 'openai' || providerType === 'anthropic') && (
                    <div
                      className="key-field"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        marginBottom: '14px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {providerType === 'openai' ? 'OpenAI Subscription' : 'Anthropic Subscription'}
                          </span>
                          {authStatus?.connected ? (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                background: '#10b98122',
                                color: '#10b981',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                border: '1px solid #10b98144',
                              }}
                            >
                              ✓ Connected {authStatus.accountEmail ? `(${authStatus.accountEmail})` : ''}
                            </span>
                          ) : checkingAuth ? (
                            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Checking login status...</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="secondary"
                          style={{
                            padding: '5px 12px',
                            fontSize: '0.8rem',
                            height: 'auto',
                            cursor: busy || loggingIn ? 'default' : 'pointer',
                          }}
                          disabled={busy || loggingIn}
                          onClick={() => void handleOAuthLogin()}
                        >
                          {loggingIn
                            ? 'Connecting...'
                            : authStatus?.connected
                              ? 'Reconnect Account'
                              : `Login with ${selectedPreset?.name || providerType}`}
                        </button>
                      </div>

                      <div style={{ fontSize: '0.78rem', opacity: 0.75, lineHeight: 1.4 }}>
                        {providerType === 'openai' ? (
                          <>
                            Checks for <strong>Codex</strong> CLI (
                            {authStatus?.tool?.installed ? 'Installed' : 'Managed by Chat Service'}) & authenticates
                            subscription API access without entering an API key.
                          </>
                        ) : (
                          <>
                            Checks for <strong>Claude Code</strong> CLI (
                            {authStatus?.tool?.installed ? 'Installed' : 'Managed by Chat Service'}) & authenticates
                            subscription API access without entering an API key.
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="key-field">
                    <label htmlFor="key-input">
                      {selectedPreset?.keyRequired && !authStatus?.connected
                        ? 'API Key'
                        : authStatus?.connected
                          ? 'API Key (Optional — OAuth Subscription Connected)'
                          : 'API Key (Optional)'}
                    </label>
                    <input
                      id="key-input"
                      type="password"
                      autoComplete="new-password"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder={
                        authStatus?.connected
                          ? 'Using connected subscription token'
                          : selectedPreset?.keyRequired
                            ? 'Enter your API key or log in above...'
                            : 'Optional'
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
