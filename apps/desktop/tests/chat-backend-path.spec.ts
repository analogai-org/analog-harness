/** Packaging refuses absent, empty, and other-platform Chat executables. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { requireChatBackend } from '../scripts/chat-backend-path.mjs'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'chat-payload-'))
  roots.push(root)
  return root
}

describe('Chat packaging payload', () => {
  it('rejects a missing backend instead of producing an installer without Chat', () => {
    expect(() => requireChatBackend([join(fixture(), 'missing')], 'win-x64')).toThrow('Chat backend missing for win-x64')
  })
  it('rejects macOS-only files for Windows and Windows-only files for macOS', () => {
    const mac = fixture()
    const windows = fixture()
    writeFileSync(join(mac, 'analog-chat-service'), 'mac executable')
    writeFileSync(join(windows, 'analog-chat-service.exe'), 'windows executable')
    expect(() => requireChatBackend([mac], 'win-x64')).toThrow('Chat backend missing')
    expect(() => requireChatBackend([windows], 'mac-arm64')).toThrow('Chat backend missing')
    expect(requireChatBackend([mac, windows], 'win-x64')).toBe(windows)
    expect(requireChatBackend([windows, mac], 'mac-arm64')).toBe(mac)
  })
  it('rejects an empty file or a directory named like the executable', () => {
    const empty = fixture()
    const directory = fixture()
    writeFileSync(join(empty, 'analog-chat-service.exe'), '')
    mkdirSync(join(directory, 'analog-chat-service.exe'))
    expect(() => requireChatBackend([empty, directory], 'win-x64')).toThrow('Chat backend missing')
  })
})
