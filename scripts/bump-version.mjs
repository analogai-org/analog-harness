#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')

const arg = process.argv[2]
if (!arg) {
  console.log(`Usage: pnpm run bump:version <patch|minor|major|x.y.z>`)
  process.exit(1)
}

function parseSemver(v) {
  const clean = v.replace(/^v/, '').split('-')[0]
  const [major, minor, patch] = clean.split('.').map(Number)
  return { major: major || 0, minor: minor || 0, patch: patch || 0 }
}

function bump(current, type) {
  const { major, minor, patch } = parseSemver(current)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      if (/^\d+\.\d+\.\d+/.test(type.replace(/^v/, ''))) {
        return type.replace(/^v/, '')
      }
      throw new Error(`Unknown bump type or invalid semver: "${type}". Use patch, minor, major, or a specific semver like 0.2.6`)
  }
}

const rootPkgPath = join(rootDir, 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const currentVersion = rootPkg.version || '0.2.5'
const newVersion = bump(currentVersion, arg)

console.log(`\n🚀 Bumping analog-harness version: ${currentVersion} -> ${newVersion}\n`)

const targetFiles = [
  join(rootDir, 'package.json'),
  ...globSync(['apps/*/package.json', 'packages/*/*/package.json'], { cwd: rootDir }).map(p => join(rootDir, p))
]

let count = 0
for (const filePath of targetFiles) {
  if (existsSync(filePath)) {
    try {
      const content = JSON.parse(readFileSync(filePath, 'utf8'))
      const old = content.version
      content.version = newVersion
      writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8')
      count++
    } catch (err) {
      console.warn(`  Warning: could not update ${filePath}: ${err.message}`)
    }
  }
}

console.log(`\n✅ Successfully updated ${count} package versions to ${newVersion}`)
console.log(`\nNext steps:`)
console.log(`  git add -u`)
console.log(`  git commit -m "chore(release): v${newVersion}"`)
console.log(`  git tag v${newVersion}`)
console.log(`  git push origin main --tags\n`)
