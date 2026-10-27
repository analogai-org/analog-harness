import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = resolve(desktopRoot, '../..')

const targetName = resolveDesktopBuildTarget()
console.log(`[prepare-analog] Preparing runtime for target: ${targetName}`)

const buildPaths = desktopTargetBuildPaths(targetName)

mkdirSync(buildPaths.packedDsh, { recursive: true })
mkdirSync(buildPaths.packedVendor, { recursive: true })
mkdirSync(buildPaths.packedLandlock, { recursive: true })

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(cmd, args, cwd) {
  console.log(`[prepare-analog] Running: ${cmd} ${args.join(' ')} in ${cwd}`)
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env })
}

// 1. Pack desktop-host
run(pnpmCmd, ['--dir', 'apps/desktop-host', 'pack', '--pack-destination', buildPaths.packedDsh], repoRoot)

// 2. Pack vendor packages
run(pnpmCmd, ['run', 'release:pack', '--family', 'vendor', '--out', buildPaths.packedVendor], repoRoot)

// 3. Pack native system / landlock
run(pnpmCmd, ['--dir', 'native/system', 'run', 'build:ts'], repoRoot)
run(pnpmCmd, ['--dir', 'native/system/packages/entry', 'pack', '--pack-destination', buildPaths.packedLandlock], repoRoot)

// 4. prepare:runtime
run(pnpmCmd, ['run', 'prepare:runtime'], desktopRoot)

// 5. prepare:packages
run(pnpmCmd, ['run', 'prepare:packages'], desktopRoot)

// 6. prepare:dsh
run(pnpmCmd, ['run', 'prepare:dsh'], desktopRoot)

console.log(`[prepare-analog] Runtime preparation successfully completed for ${targetName}!`)
