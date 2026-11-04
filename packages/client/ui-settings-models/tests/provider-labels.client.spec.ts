/** API labels preserve subscription identities and user-defined connection names. */
import { describe, expect, it } from 'vitest'
import { providerDisplayLabel } from '../src/client/provider-labels.ts'
import { en } from '../src/client/locales.ts'

const t = (key: keyof typeof en): string => en[key]

describe('provider display labels', () => {
  it.each(['OpenAI', 'Anthropic'])('labels the standard %s API connection', name => {
    expect(providerDisplayLabel({ name, auth_type: 'api_key' }, t)).toBe(`${name} API`)
  })

  it.each(['OpenAI Subscription (Codex)', 'Anthropic Subscription (Claude Code)'])('preserves %s', name => {
    expect(providerDisplayLabel({ name, auth_type: 'subscription' }, t)).toBe(name)
  })

  it('preserves a subscription with a plain provider name', () => {
    expect(providerDisplayLabel({ name: 'OpenAI', auth_type: 'subscription' }, t)).toBe('OpenAI')
    expect(providerDisplayLabel({ name: 'Anthropic', api_key: 'oauth:anthropic:default' }, t)).toBe('Anthropic')
  })

  it('preserves custom display names', () => {
    expect(providerDisplayLabel({ name: 'openai', display_name: 'Team gateway', auth_type: 'api_key' }, t)).toBe('Team gateway')
  })
})
