/** Verify release version selection without executing Git writes, builds, SSH, or uploads. */
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parse } from 'smol-toml'
import { valid, gt, inc } from 'semver'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const script = readFileSync(join(root, 'scripts/github-build.sh'), 'utf8')
const source = script.match(/node --input-type=module - "\$CHAT_ROOT" "\$1" <<'JS'\n([\s\S]*?)\nJS/)?.[1]
if (source === undefined) throw new Error('Version selector not found')
const calculation = source.replace(/^import .*\n/gm, '')

function select(harness: string, chat: string, request: string): string {
  let result = ''
  runInNewContext(calculation, {
    readFileSync: (file: string) => file === 'package.json'
      ? JSON.stringify({ version: harness }) : `[tool.poetry]\nversion = "${chat}"\n`,
    join, parse, valid, gt, inc,
    process: { argv: ['node', '-', '/chat', request] },
    console: { log: (version: string) => { result = version } },
  }, { timeout: 1000 })
  return result
}

describe('combined release versions', () => {
  it.each([
    ['0.3.7', '0.3.7', 'patch', '0.3.8'],
    ['0.3.7', '0.4.0', 'patch', '0.4.1'],
    ['0.4.0', '0.3.7', 'minor', '0.5.0'],
    ['0.3.7', '0.4.0', 'major', '1.0.0'],
    ['0.3.7', '0.3.7', '0.4.0', '0.4.0'],
    ['0.3.7', '0.3.7', 'v0.4.0-rc.1', '0.4.0-rc.1'],
  ])('advances Harness %s and Chat %s using %s', (harness, chat, request, expected) => {
    expect(select(harness, chat, request)).toBe(expected)
  })

  it.each([
    ['0.3.7', '0.4.0', '0.3.8'],
    ['0.4.0', '0.3.7', '0.4.0'],
    ['0.3.7', '0.3.7', '0.3.7-rc.1'],
    ['0.3.7', '0.3.7', 'not-a-version'],
    ['broken', '0.3.7', 'patch'],
    ['0.3.7', 'broken', 'patch'],
  ])('rejects versions that cannot advance both: %s, %s, %s', (harness, chat, request) => {
    expect(() => select(harness, chat, request)).toThrow()
  })
})
