// @vitest-environment jsdom
/** Provider catalog choices and custom model IDs reach the Chat model editor. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelsSection } from '../src/client/ModelsSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const providers = [
  { id: 'openai-api', name: 'OpenAI', auth_type: 'api_key', provider_type: 'openai' },
  { id: 'anthropic-api', name: 'Anthropic', auth_type: 'api_key', provider_type: 'anthropic' },
  { id: 'openai-subscription', name: 'OpenAI Subscription (Codex)', auth_type: 'subscription', provider_type: 'openai' },
  { id: 'anthropic-subscription', name: 'Anthropic Subscription (Claude Code)', auth_type: 'subscription', provider_type: 'anthropic' },
]

function installBackend(openAIConnected = false) {
  const writes: Array<{ name: string; provider_id: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname
    if (path === '/v1/agents') return Response.json([{ id: 'default', name: 'Default' }])
    if (path === '/v1/providers') return Response.json(providers)
    if (path === '/v1/agents/default/models') {
      if (init?.method === 'POST') {
        if (typeof init.body !== 'string') throw new Error('Model request body must be JSON text')
        const payload = JSON.parse(init.body) as { name: string; provider_id: string }
        writes.push(payload)
        return Response.json({ id: 'saved', ...payload })
      }
      return Response.json([])
    }
    if (path === '/v1/providers/openai-api/models') return Response.json({ data: [{ id: 'openai-example' }] })
    if (path === '/v1/providers/anthropic-subscription/models') return Response.json({ data: [{ id: 'anthropic-example' }] })
    if (path === '/v1/auth/openai/status') return Response.json({ connected: openAIConnected, account_email: 'giorgi@analogai.net' })
    if (path === '/v1/auth/anthropic/status') return Response.json({ connected: false })
    throw new Error(`Unexpected test request: ${path}`)
  }))
  return writes
}

function installSubscriptionBackend() {
  const providerWrites: Record<string, unknown>[] = []
  const toolLogins: string[] = []
  const pending: Array<{
    connectionId: string
    signal: AbortSignal | null | undefined
    respond: (connected: boolean, accountEmail?: string) => void
  }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/v1/agents') return Response.json([{ id: 'default', name: 'Default' }])
    if (url.pathname === '/v1/providers') {
      if (init?.method === 'POST') {
        if (typeof init.body !== 'string') throw new Error('Provider request body must be JSON text')
        const payload = JSON.parse(init.body) as Record<string, unknown>
        providerWrites.push(payload)
        return Response.json({ id: 'new-subscription', ...payload })
      }
      return Response.json(providers)
    }
    if (url.pathname === '/v1/agents/default/models') return Response.json([])
    if (url.pathname === '/v1/auth/openai/tools/login') {
      toolLogins.push(url.href)
      return Response.json({ login_url: '/v1/auth/openai/login' })
    }
    if (url.pathname === '/v1/auth/openai/status') {
      const connectionId = url.searchParams.get('connection_id')
      if (connectionId === null || connectionId === 'default') {
        return Response.json({ connected: true, account_email: 'existing@example.com' })
      }
      return new Promise<Response>((resolve, reject) => {
        const abort = () => { reject(new DOMException('Aborted', 'AbortError')) }
        init?.signal?.addEventListener('abort', abort, { once: true })
        pending.push({
          connectionId,
          signal: init?.signal,
          respond: (connected, accountEmail) => {
            init?.signal?.removeEventListener('abort', abort)
            resolve(Response.json({ connected, account_email: accountEmail, connection_id: connectionId }))
          },
        })
      })
    }
    if (url.pathname === '/v1/auth/anthropic/status') return Response.json({ connected: false })
    throw new Error(`Unexpected test request: ${url.pathname}`)
  }))
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  const open = vi.fn<typeof window.open>(() => window)
  vi.stubGlobal('open', open)
  return {
    providerWrites,
    toolLogins,
    pending,
    open,
    close,
    respond: async (connected: boolean, accountEmail?: string) => {
      await act(async () => {
        for (const request of pending.splice(0)) request.respond(connected, accountEmail)
      })
    },
  }
}

describe('Chat model editor', () => {
  it('saves the ID selected from the provider catalog', async () => {
    const writes = installBackend()
    render(<ModelsSection t={key => en[key]} />)
    await screen.findByText('OpenAI API')
    const card = screen.getByText('Reasoning Model').closest('div')
    if (card === null) throw new Error('Reasoning model card is missing')
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    const catalog = await screen.findByRole<HTMLSelectElement>('combobox', { name: en.providerModelCatalog })
    await screen.findByRole('option', { name: 'openai-example' })
    fireEvent.change(catalog, { target: { value: 'openai-example' } })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: en.modelId }).value).toBe('openai-example')
    fireEvent.click(screen.getByRole('button', { name: 'Save Model' }))
    await waitFor(() => { expect(writes[0]).toMatchObject({ name: 'openai-example', provider_id: 'openai-api' }) })
  })

  it('keeps custom input editable when choosing a subscription provider', async () => {
    const writes = installBackend()
    render(<ModelsSection t={key => en[key]} />)
    await screen.findByText('OpenAI API')
    const card = screen.getByText('Reasoning Model').closest('div')
    if (card === null) throw new Error('Reasoning model card is missing')
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    const providerSelect = within(dialog).getAllByRole('combobox')[0]
    if (providerSelect === undefined) throw new Error('Provider selection is missing')
    fireEvent.change(providerSelect, { target: { value: 'anthropic-subscription' } })
    await screen.findByRole('option', { name: 'anthropic-example' })
    fireEvent.change(screen.getByRole('combobox', { name: en.providerModelCatalog }), { target: { value: 'anthropic-example' } })
    fireEvent.change(screen.getByRole('textbox', { name: en.modelId }), { target: { value: 'my-custom-model' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Model' }))
    await waitFor(() => { expect(writes[0]).toMatchObject({ name: 'my-custom-model', provider_id: 'anthropic-subscription' }) })
  })

  it('renames only API providers in the list and provider presets', async () => {
    installBackend()
    render(<ModelsSection t={key => en[key]} />)
    await screen.findByText('OpenAI API')
    expect(screen.getByText('Anthropic API')).toBeTruthy()
    expect(screen.getByText('OpenAI Subscription (Codex)')).toBeTruthy()
    expect(screen.getByText('Anthropic Subscription (Claude Code)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const options = within(screen.getByRole('dialog')).getAllByRole<HTMLOptionElement>('option').map(option => option.textContent)
    expect(options).toContain('OpenAI API')
    expect(options).toContain('Anthropic API')
    expect(options).toContain('OpenAI Subscription (Codex)')
    expect(options).toContain('Anthropic Subscription (Claude Code)')
  })

  it('shows Connect while adding an OpenAI subscription and no connection action when editing one', async () => {
    installBackend(true)
    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    const subscription = await screen.findByText('OpenAI Subscription (Codex)')
    const row = subscription.closest('tr')
    if (row === null) throw new Error('OpenAI subscription row is missing')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog')
    await within(dialog).findByText('Connected: giorgi@analogai.net')
    expect(within(dialog).queryByRole('button', { name: 'Connect' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Connect' })).toBeTruthy()
  })

  it('connects a separate OpenAI account before explicitly adding its provider', async () => {
    const backend = installSubscriptionBackend()
    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    await screen.findByText('OpenAI API')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))

    expect(backend.open).toHaveBeenCalledOnce()
    expect(backend.toolLogins).toEqual([])
    const loginUrl = new URL(backend.open.mock.calls[0]?.[0] ?? '')
    expect(loginUrl.pathname).toBe('/v1/auth/openai/login')
    expect(loginUrl.searchParams.get('create_provider')).toBe('false')
    const connectionId = loginUrl.searchParams.get('connection_id')
    expect(connectionId).toBeTruthy()

    await waitFor(() => { expect(backend.pending.length).toBeGreaterThan(0) })
    expect(backend.pending.every(request => request.connectionId === connectionId)).toBe(true)
    await backend.respond(false)
    expect(within(dialog).getByRole('button', { name: 'Connecting…' })).toBeTruthy()
    expect(within(dialog).queryByText('Connected: existing@example.com')).toBeNull()
    expect(backend.providerWrites).toEqual([])

    await waitFor(() => { expect(backend.pending.length).toBeGreaterThan(0) })
    await backend.respond(true, 'new@example.com')
    await within(dialog).findByText('Connected: new@example.com')
    expect(within(dialog).queryByRole('button', { name: 'Connect' })).toBeNull()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(backend.providerWrites).toEqual([])

    fireEvent.click(within(dialog).getByRole('button', { name: /^Add Provider$/ }))
    await waitFor(() => { expect(backend.providerWrites).toHaveLength(1) })
    expect(backend.providerWrites[0]).toMatchObject({
      auth_type: 'subscription',
      provider_type: 'openai',
      api_key: `oauth:openai:${connectionId}`,
    })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('keeps popup success in the dialog until the provider is added', async () => {
    const backend = installSubscriptionBackend()
    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    await screen.findByText('OpenAI API')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const dialog = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    })
    expect(backend.pending).toHaveLength(1)
    await backend.respond(false)

    expect(backend.pending).toHaveLength(0)
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:1455',
        source: null,
        data: { type: 'openai_oauth_success', account_email: 'wrong@example.com' },
      }))
    })
    expect(backend.pending).toHaveLength(0)
    expect(within(dialog).getByRole('button', { name: 'Connecting…' })).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:1455',
        source: window,
        data: { type: 'openai_oauth_success', account_email: 'unconfirmed@example.com' },
      }))
    })
    expect(backend.pending).toHaveLength(1)
    await backend.respond(true, 'new@example.com')
    expect(within(dialog).getByText('Connected: new@example.com')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(within(dialog).getByRole('button', { name: /^Add Provider$/ })).toBeTruthy()
    expect(backend.providerWrites).toEqual([])
  })

  it('keeps connecting when Desktop opens sign-in in the external browser', async () => {
    const backend = installSubscriptionBackend()
    backend.open.mockReturnValue(null)
    render(<ModelsSection opensAuthExternally
      t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    await screen.findByText('OpenAI API')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))

    expect(backend.open).toHaveBeenCalledOnce()
    await waitFor(() => { expect(backend.pending).toHaveLength(1) })
    await backend.respond(false)
    expect(within(dialog).getByRole('button', { name: 'Connecting…' })).toBeTruthy()
    expect(screen.queryByText(en.oauthPopupBlocked)).toBeNull()
    expect(backend.providerWrites).toEqual([])

    await waitFor(() => { expect(backend.pending).toHaveLength(1) })
    await backend.respond(true, 'desktop@example.com')
    await within(dialog).findByText('Connected: desktop@example.com')
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(backend.providerWrites).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add Provider$/ }))
    await waitFor(() => { expect(backend.providerWrites).toHaveLength(1) })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('reports a blocked browser popup before polling account status', async () => {
    const backend = installSubscriptionBackend()
    backend.open.mockReturnValue(null)
    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    await screen.findByText('OpenAI API')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))

    await screen.findByText(en.oauthPopupBlocked)
    expect(within(dialog).getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(backend.pending).toHaveLength(0)
    expect(backend.providerWrites).toEqual([])
  })

  it('cancels a pending subscription connection when its dialog closes', async () => {
    const backend = installSubscriptionBackend()
    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)
    await screen.findByText('OpenAI API')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    await waitFor(() => { expect(backend.pending.length).toBeGreaterThan(0) })
    const request = backend.pending[0]
    if (request === undefined) throw new Error('Connection status request is missing')

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    })
    expect(request.signal?.aborted).toBe(true)
    expect(backend.close).toHaveBeenCalledOnce()
    await backend.respond(true, 'late@example.com')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const reopened = screen.getByRole('dialog')
    expect(within(reopened).getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(within(reopened).queryByText('Connected: late@example.com')).toBeNull()
    expect(backend.providerWrites).toEqual([])
  })

  it('shows each subscription account with edit and delete actions', async () => {
    const firstId = '11111111-1111-4111-8111-111111111111'
    const secondId = '22222222-2222-4222-8222-222222222222'
    const subscriptions = [
      { id: 'first', name: 'OpenAI Subscription (Codex)', provider_type: 'openai', auth_type: 'subscription', api_key: `oauth:openai:${firstId}` },
      { id: 'second', name: 'OpenAI Subscription (Codex)', provider_type: 'openai', auth_type: 'subscription', api_key: `oauth:openai:${secondId}` },
    ]
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/v1/agents') return Response.json([{ id: 'default', name: 'Default' }])
      if (url.pathname === '/v1/providers') return Response.json(subscriptions)
      if (url.pathname === '/v1/agents/default/models') return Response.json([])
      if (url.pathname === '/v1/auth/openai/status') {
        const email = url.searchParams.get('connection_id') === firstId ? 'first@example.com' : 'second@example.com'
        return Response.json({ connected: true, account_email: email })
      }
      if (url.pathname === '/v1/auth/anthropic/status') return Response.json({ connected: false })
      throw new Error(`Unexpected test request: ${url.pathname}`)
    }))

    render(<ModelsSection t={(key, params) => en[key].replace('{account}', params?.account ?? '{account}')} />)

    for (const account of ['first@example.com', 'second@example.com']) {
      const email = await screen.findByText(account)
      const row = email.closest('tr')
      if (row === null) throw new Error(`Provider row for ${account} is missing`)
      expect(within(row).getByRole('button', { name: 'Edit' })).toBeTruthy()
      expect(within(row).getByRole('button', { name: 'Delete' })).toBeTruthy()
    }
    const secondRow = screen.getByText('second@example.com').closest('tr')
    if (secondRow === null) throw new Error('Second provider row is missing')
    fireEvent.click(within(secondRow).getByRole('button', { name: 'Edit' }))
    await within(screen.getByRole('dialog')).findByText('Connected: second@example.com')
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Connect' })).toBeNull()
  })
})
