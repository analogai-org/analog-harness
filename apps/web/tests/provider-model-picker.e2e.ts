/** Real Web UI with external Chat API responses mocked; no account or model requests. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/provider-model-picker/', import.meta.url))
const MODE = webSnapshotMode()
const CUSTOM_MODEL = 'my-org/unlisted-v2'
const PROVIDERS = [
  { id: 'openai-api', name: 'OpenAI', auth_type: 'api_key', provider_type: 'openai' },
  { id: 'anthropic-api', name: 'Anthropic', auth_type: 'api_key', provider_type: 'anthropic' },
  { id: 'openai-subscription', name: 'OpenAI Subscription (Codex)', auth_type: 'subscription', provider_type: 'openai' },
  { id: 'anthropic-subscription', name: 'Anthropic Subscription (Claude Code)', auth_type: 'subscription', provider_type: 'anthropic' },
].map(provider => ({ ...provider, agent_id: 'default' }))

describe('web e2e: provider model suggestions with a manually editable ID', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const models: Record<string, unknown>[] = []
  const saved: Record<string, unknown>[] = []
  const unexpected: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    // CI uses Playwright Chromium; local checkouts may only have system Chrome.
    browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
    tripwire = watchConsole(page)
    await page.route('http://localhost:8071/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      const headers = { 'access-control-allow-origin': '*' }
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          ...headers,
          'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
          'access-control-allow-headers': 'content-type',
        } })
        return
      }
      let response: unknown
      if (method === 'GET' && path === '/v1/agents') response = [{ id: 'default', name: 'Fixture Agent' }]
      else if (method === 'GET' && path === '/v1/providers') response = PROVIDERS
      else if (method === 'GET' && path === '/v1/agents/default/models') response = models
      else if (method === 'GET' && (path === '/v1/auth/openai/status' || path === '/v1/auth/anthropic/status')) {
        response = { connected: false }
      } else if (method === 'GET' && path === '/v1/providers/openai-api/models') {
        response = { data: [{ id: 'fixture/openai-v1', name: 'Fixture OpenAI model' }] }
      } else if (method === 'GET' && path === '/v1/providers/anthropic-api/models') {
        response = { data: [{ id: 'fixture/anthropic-v1', name: 'Fixture Anthropic model' }] }
      } else if (method === 'GET' && path === '/v1/providers/openai-subscription/models') {
        response = { data: [{ id: 'fixture/subscription-v1', name: 'Fixture subscription model' }] }
      } else if (method === 'POST' && path === '/v1/agents/default/models') {
        const payload = request.postDataJSON() as Record<string, unknown>
        saved.push(payload)
        const model = { ...payload, id: 'fixture-saved-model' }
        models.push(model)
        response = model
      } else {
        unexpected.push(`${method} ${path}`)
        await route.fulfill({ status: 500, headers, json: { detail: 'Unexpected fixture request' } })
        return
      }
      await route.fulfill({ headers, json: response })
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  })

  afterAll(async () => {
    try { await browser?.close() } finally { await scaffold?.close() }
  })

  it('selects an exact listed ID, keeps custom input across providers, and saves it', async () => {
    onTestFailed(() => saveFailureShot(page, 'provider-model-picker'))
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Models', exact: true }).click()
    await settings.getByText('OpenAI API', { exact: true }).waitFor()
    await settings.getByText('Anthropic API', { exact: true }).waitFor()
    expect(await settings.getByText('OpenAI Subscription (Codex)', { exact: true }).count()).toBe(1)
    expect(await settings.getByText('Anthropic Subscription (Claude Code)', { exact: true }).count()).toBe(1)
    const openReasoning = async (): Promise<void> => {
      await settings.getByText('Reasoning Model', { exact: true }).locator('..')
        .getByRole('button', { name: 'Edit', exact: true }).click()
    }
    await openReasoning()
    const dialog = page.getByRole('dialog', { name: 'Edit Reasoning Model', exact: true })
    const input = dialog.getByRole('textbox', { name: 'Model ID', exact: true })
    const catalog = dialog.getByRole('combobox', { name: 'Available models', exact: true })
    const provider = dialog.getByRole('combobox').first()
    await catalog.getByRole('option', { name: 'Fixture OpenAI model (fixture/openai-v1)', exact: true }).waitFor()
    await catalog.selectOption('fixture/openai-v1')
    expect(await input.inputValue()).toBe('fixture/openai-v1')
    await compareOrRefreshGolden(join(EXPECTED, 'listed-model.expected.md'), await captureStableAria(
      page, '[role="dialog"][aria-label="Edit Reasoning Model"]', scaffold.workspaceCwd,
    ), MODE)

    await input.fill(CUSTOM_MODEL)
    await provider.selectOption('openai-subscription')
    await catalog.getByRole('option', { name: 'Fixture subscription model (fixture/subscription-v1)', exact: true }).waitFor()
    expect(await input.inputValue()).toBe(CUSTOM_MODEL)
    await provider.selectOption('anthropic-api')
    await catalog.getByRole('option', { name: 'Fixture Anthropic model (fixture/anthropic-v1)', exact: true }).waitFor()
    expect(await input.inputValue()).toBe(CUSTOM_MODEL)
    expect(await provider.locator('option').allTextContents()).toEqual([
      'OpenAI API', 'Anthropic API', 'OpenAI Subscription (Codex)', 'Anthropic Subscription (Claude Code)',
    ])
    await compareOrRefreshGolden(join(EXPECTED, 'custom-provider.expected.md'), await captureStableAria(
      page, '[role="dialog"][aria-label="Edit Reasoning Model"]', scaffold.workspaceCwd,
    ), MODE)

    await dialog.getByRole('button', { name: 'Save Model', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await expect.poll(() => saved.length).toBe(1)
    expect(saved[0]).toMatchObject({ name: CUSTOM_MODEL, model_name: CUSTOM_MODEL, provider_id: 'anthropic-api' })
    await settings.getByText(CUSTOM_MODEL, { exact: true }).waitFor()
    await openReasoning()
    await catalog.getByRole('option', { name: 'Fixture Anthropic model (fixture/anthropic-v1)', exact: true }).waitFor()
    expect(await input.inputValue()).toBe(CUSTOM_MODEL)
    expect(await provider.inputValue()).toBe('anthropic-api')
    expect(unexpected).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(EXPECTED, ['listed-model.expected.md', 'custom-provider.expected.md'])
  })
})
