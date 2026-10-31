/** Shared provider display order for the composer and command model pickers. */

/**
 * Put OpenAI and Anthropic first as default providers, followed by DeepSeek.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
function providerRank(id: string): number {
  switch (id) {
    case 'openai': return 0
    case 'anthropic': return 1
    case 'deepseek-official': return 2
    case 'deepseek-account': return 3
    default: return 4
  }
}

export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id))
}
