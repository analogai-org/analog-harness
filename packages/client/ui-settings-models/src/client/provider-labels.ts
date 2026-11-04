/** Display labels for standard API providers and user-named connections. */
import type { ModelsKey } from './locales.ts'

interface ProviderLabelInput {
  name: string
  display_name?: string
  auth_type?: string
  api_key?: string
}

/**
 * Label standard API connections without renaming subscriptions or custom names.
 * @param provider - The saved provider identity and authentication kind.
 * @param t - This package's localized copy.
 * @returns The API label or the provider's existing display name.
 */
export function providerDisplayLabel(provider: ProviderLabelInput, t: (key: ModelsKey) => string): string {
  const label = provider.display_name || provider.name
  if (provider.auth_type === 'subscription' || provider.api_key?.startsWith('oauth:')) return label
  switch (label.trim().toLowerCase()) {
    case 'openai': return t('openAiApi')
    case 'anthropic': return t('anthropicApi')
    default: return label
  }
}
