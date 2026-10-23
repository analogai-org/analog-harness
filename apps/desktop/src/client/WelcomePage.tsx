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

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    teacherModel: 'deepseek-reasoner',
    studentModel: 'deepseek-chat',
    keyRequired: true,
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
    teacherModel: 'claude-3-7-sonnet-latest',
    studentModel: 'claude-3-5-haiku-latest',
    keyRequired: true,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    teacherModel: 'deepseek/deepseek-r1',
    studentModel: 'deepseek/deepseek-chat',
    keyRequired: true,
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    teacherModel: 'deepseek-r1-distill-llama-70b',
    studentModel: 'llama-3.3-70b-versatile',
    keyRequired: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    teacherModel: 'deepseek-r1:14b',
    studentModel: 'qwen2.5-coder:7b',
    keyRequired: false,
  },
  custom: {
    name: 'Custom Provider',
    baseUrl: '',
    teacherModel: '',
    studentModel: '',
    keyRequired: true,
  },
}

const DEFAULT_PRESET: ProviderPreset = PROVIDER_PRESETS.deepseek!
const SHOW_OPENAI_OAUTH = false

export function Welcome({ api }: { api: WelcomeApi }) {
  // Step 0: Welcome overview with "Start Configuration" button
  // Step 1: Add Providers
  // Step 2: Add Teacher & Student models
  const [step, setStep] = useState<0 | 1 | 2>(0)

  const [providerType, setProviderType] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PRESET.baseUrl)
  const [teacherModel, setTeacherModel] = useState(DEFAULT_PRESET.teacherModel)
  const [studentModel, setStudentModel] = useState(DEFAULT_PRESET.studentModel)

  const [oauthAccount, setOauthAccount] = useState<string | null>(null)
  const isOpenAI = providerType === 'openai'

  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    document.title = 'Analog AI Harness Setup'
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!isOpenAI) return
    let active = true

    const checkStatus = async () => {
      try {
        const endpoints = [
          'http://127.0.0.1:8071/auth/openai/status',
          'http://localhost:8071/auth/openai/status',
          '/auth/openai/status',
        ]
        for (const ep of endpoints) {
          try {
            const res = await fetch(ep)
            if (res.ok) {
              const data = await res.json()
              if (active && data.connected) {
                setOauthAccount(data.account_email || 'OpenAI Subscription Active')
                setError('')
                break
              }
            }
          } catch {
            // try next endpoint
          }
        }
      } catch {
        // ignore
      }
    }

    void checkStatus()
    const interval = setInterval(() => {
      void checkStatus()
    }, 1500)

    const handleFocus = () => {
      void checkStatus()
    }

    const handleMessage = (evt: MessageEvent) => {
      if (evt.data && evt.data.type === 'openai_oauth_success') {
        setOauthAccount(evt.data.account_email || 'OpenAI Subscription Active')
        setError('')
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('message', handleMessage)
    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('message', handleMessage)
    }
  }, [isOpenAI])

  const handleOpenAILogin = async () => {
    const loginUrl = 'http://127.0.0.1:8071/auth/openai/login'
    setError('')
    try {
      if (api.openExternal) {
        await api.openExternal(loginUrl)
      } else {
        const popup = window.open(
          loginUrl,
          'OpenAIOAuthPopup',
          'width=540,height=680,menubar=no,toolbar=no,location=no,status=no',
        )
        if (!popup) {
          window.open(loginUrl, '_blank')
        }
      }
    } catch {
      window.open(loginUrl, '_blank')
    }
  }

  function handleProviderChange(type: string) {
    setProviderType(type)
    const preset = PROVIDER_PRESETS[type]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      if (preset.teacherModel) setTeacherModel(preset.teacherModel)
      if (preset.studentModel) setStudentModel(preset.studentModel)
    }
    setError('')
  }

  function handleStep1Next() {
    const preset = PROVIDER_PRESETS[providerType]
    const keyRequired = preset ? preset.keyRequired : true

    if (isOpenAI && SHOW_OPENAI_OAUTH) {
      if (!oauthAccount && !apiKey.trim()) {
        setError('Please log in with your OpenAI subscription or enter an API key.')
        return
      }
    } else if (keyRequired && !apiKey.trim()) {
      setError(`Please provide an API key for ${preset?.name ?? providerType}`)
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

    const finalApiKey = isOpenAI && !apiKey.trim() && oauthAccount
      ? 'oauth_subscription_active'
      : apiKey.trim()

    const params: AnalogSetupParams = {
      providerType,
      providerApiKey: finalApiKey,
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

  const selectedPreset = PROVIDER_PRESETS[providerType] ?? DEFAULT_PRESET
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

              <div className="key-field">
                <label htmlFor="provider-select">Provider</label>
                <select
                  id="provider-select"
                  value={providerType}
                  disabled={busy}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {Object.entries(PROVIDER_PRESETS).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.name}
                    </option>
                  ))}
                </select>
              </div>

              {SHOW_OPENAI_OAUTH && isOpenAI && (
                <div className="openai-subscription-card">
                  <div className="openai-subscription-header">
                    <div className="openai-subscription-title">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#10a37f' }}>
                        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.259 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7466-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.02 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.872zm16.597 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6669zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                      </svg>
                      <span>OpenAI Subscription (OAuth)</span>
                    </div>
                    <button
                      type="button"
                      className="openai-login-btn"
                      onClick={handleOpenAILogin}
                    >
                      {oauthAccount ? 'Reconnect OpenAI' : 'Log in with OpenAI'}
                    </button>
                  </div>
                  <p className="openai-desc">
                    Connecting with OpenAI login uses your existing ChatGPT Plus, Pro, or Team subscription — substantially less costly than paying per token on the standard API.
                  </p>
                  {oauthAccount && (
                    <div className="openai-connected-status">
                      ✓ Connected as <strong>{oauthAccount}</strong> (auto-refreshing OAuth session)
                    </div>
                  )}
                </div>
              )}

              <div className="key-field">
                <label htmlFor="key-input">
                  {SHOW_OPENAI_OAUTH && isOpenAI
                    ? (oauthAccount ? 'API Key (Optional with OpenAI Login)' : 'API Key (or Login Above)')
                    : (selectedPreset.keyRequired ? 'API Key' : 'API Key (Optional)')}
                </label>
                <input
                  id="key-input"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    SHOW_OPENAI_OAUTH && isOpenAI && oauthAccount
                      ? 'Optional (using OAuth subscription)'
                      : (selectedPreset.keyRequired ? 'Enter your API key...' : 'Optional')
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
                    placeholder="e.g. http://localhost:11434/v1"
                    value={baseUrl}
                    disabled={busy}
                    onChange={(e) => {
                      setBaseUrl(e.target.value)
                      setError('')
                    }}
                  />
                </div>
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
                onClick={handleStep1Next}
              >
                Next
              </button>
              <button
                id="step1-back-btn"
                className="back"
                type="button"
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

