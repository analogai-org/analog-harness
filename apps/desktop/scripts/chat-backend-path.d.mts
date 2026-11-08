/** Target-specific Chat payload selection for Desktop packaging. */
import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/**
 * Find a directory containing a nonempty backend executable for the target.
 * @param directories - Candidate directories in preference order.
 * @param target - Desktop packaging target.
 * @returns Matching directory, or undefined when unavailable.
 */
export function findChatBackend(directories: string[], target: DesktopAutoUpdateTarget): string | undefined

/**
 * Require a backend executable before packaging; throws when unavailable.
 * @param directories - Candidate backend directories.
 * @param target - Desktop packaging target.
 * @returns Directory containing the required executable.
 */
export function requireChatBackend(directories: string[], target: DesktopAutoUpdateTarget): string
