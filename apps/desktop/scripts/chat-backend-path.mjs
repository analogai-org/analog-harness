/** Select the required Chat executable for the Desktop packaging target. */
import { statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Find a complete backend candidate without accepting another platform's executable.
 * @param {string[]} directories - Candidate directories in preference order.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64'} target - Desktop packaging target.
 * @returns {string | undefined} Directory containing a nonempty executable, if present.
 */
export function findChatBackend(directories, target) {
  const executable = target === 'win-x64' ? 'analog-chat-service.exe' : 'analog-chat-service'
  return directories.find(directory => {
    const file = statSync(join(directory, executable), { throwIfNoEntry: false })
    return file?.isFile() && file.size > 0
  })
}

/**
 * Require a backend before electron-builder can produce a Desktop installer.
 * @param {string[]} directories - Candidate backend directories.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64'} target - Desktop packaging target.
 * @returns {string} Directory containing the required executable.
 */
export function requireChatBackend(directories, target) {
  const directory = findChatBackend(directories, target)
  if (!directory) throw new Error(`Chat backend missing for ${target}; build or download the matching backend before packaging Desktop`)
  return directory
}
