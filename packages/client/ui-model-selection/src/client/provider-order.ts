/** Shared provider display order for the composer and command model pickers. */

/**
 * Account models first, followed by official models, followed by custom/third-party.
 * @param id - Provider group identifier.
 * @returns rank number for sorting.
 */
function providerRank(id: string): number {
  switch (id) {
    case "deepseek-account": return 0
    case "deepseek-official": return 1
    case "openai": return 2
    case "anthropic": return 3
    default: return 4
  }
}

/**
 * Orders model provider groups with primary providers first.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id))
}
