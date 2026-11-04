// @vitest-environment jsdom
/** Provider catalog choices and custom model IDs reach the Chat model editor. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelsSection } from '../src/client/ModelsSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const providers = [
  { id: 'openai-api', name: 'OpenAI', auth_type: 'api_key', provider_type: 'openai' },
  { id: 'anthropic-api', name: 'Anthropic', auth_type: 'api_key', provider_type: 'anthropic' },
  { id: 'openai-subscription', name: 'OpenAI Subscription (Codex)', auth_type: 'subscription', provider_type: 'openai' },
  { id: 'anthropic-subscription', name: 'Anthropic Subscription (Claude Code)', auth_type: 'subscription', provider_type: 'anthropic' },
]

function installBackend() {
  const writes: Array<{ name: string; provider_id: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path === '/v1/agents') return Response.json([{ id: 'default', name: 'Default' }])
    if (path === '/v1/providers') return Response.json(providers)
    if (path === '/v1/agents/default/models') {
      if (init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { name: string; provider_id: string }
        writes.push(payload)
        return Response.json({ id: 'saved', ...payload })
      }
      return Response.json([])
    }
    if (path === '/v1/providers/openai-api/models') return Response.json({ data: [{ id: 'openai-example' }] })
    if (path === '/v1/providers/anthropic-subscription/models') return Response.json({ data: [{ id: 'anthropic-example' }] })
    if (path === '/v1/auth/openai/status' || path === '/v1/auth/anthropic/status') return Response.json({ connected: false })
    throw new Error(`Unexpected test request: ${path}`)
  }))
  return writes
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
})
