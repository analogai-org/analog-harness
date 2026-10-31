import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './scripts/desktop-build-paths.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const prebuiltChatPath = join(root, 'prebuilt/analog-chat-service')
const chatServiceDistPath = fileURLToPath(new URL('../../../chat/dist/analog-chat-service', import.meta.url))
const chatServiceWinDistPath = fileURLToPath(new URL('../../../chat/dist/analog-chat-service-win/analog-chat-service', import.meta.url))
const chatMainDistPath = fileURLToPath(new URL('../../../chat/dist/main.dist', import.meta.url))

const targetName = resolveDesktopBuildTarget(process.env, process.platform, process.arch)
const buildPaths = desktopTargetBuildPaths(targetName)
const dshTargetRoot = buildPaths.dsh
const runtimeTargetRoot = buildPaths.runtime

// Single source of truth for application version
function resolveAppVersion() {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION.replace(/^v/, '')
  }
  if (process.env.RELEASE_VERSION) {
    return process.env.RELEASE_VERSION.replace(/^v/, '')
  }
  if (process.env.GITHUB_REF_NAME && (process.env.GITHUB_REF_TYPE === 'tag' || process.env.GITHUB_REF_NAME.startsWith('v'))) {
    return process.env.GITHUB_REF_NAME.replace(/^v/, '')
  }
  try {
    const pkgPath = join(root, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.version && pkg.version !== '0.0.0-dev') {
        return pkg.version.replace(/^v/, '')
      }
    }
  } catch {}
  try {
    const rootPkgPath = join(root, '../../package.json')
    if (existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
      if (rootPkg.version && rootPkg.version !== '0.0.0-dev') {
        return rootPkg.version.replace(/^v/, '')
      }
    }
  } catch {}
  try {
    const exactTag = execSync('git describe --tags --exact-match', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
    if (exactTag) return exactTag.replace(/^v/, '')
  } catch {}
  try {
    const latestTag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
    if (latestTag) return latestTag.replace(/^v/, '')
  } catch {}
  return '0.0.0-dev'
}

const appVersion = resolveAppVersion()

// Critical integrity checks: abort immediately if dependencies were not prepared
const runtimeDescriptorPath = join(dshTargetRoot, 'desktop-runtime.json')
if (!existsSync(runtimeDescriptorPath)) {
  throw new Error(`[analog-builder] CRITICAL ERROR: desktop-runtime.json not found at ${runtimeDescriptorPath}. You must run 'pnpm run prepare:analog' before packaging.`)
}
if (!existsSync(runtimeTargetRoot)) {
  throw new Error(`[analog-builder] CRITICAL ERROR: runtime directory not found at ${runtimeTargetRoot}. You must run 'pnpm run prepare:analog' before packaging.`)
}

const resolvedChatPath = existsSync(prebuiltChatPath)
  ? prebuiltChatPath
  : (existsSync(chatServiceWinDistPath)
    ? chatServiceWinDistPath
    : (existsSync(chatServiceDistPath) ? chatServiceDistPath : (existsSync(chatMainDistPath) ? chatMainDistPath : undefined)))

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'ai.analog.desktop',
  productName: 'Analog',
  executableName: 'Analog',
  extraMetadata: {
    version: appVersion,
  },
  artifactName: 'Analog-${version}-${os}-${arch}.${ext}',
  directories: {
    output: join(root, 'release-builds'),
    buildResources: join(root, 'resources'),
  },
  asar: true,
  asarUnpack: [
    '**/*.{node,dylib,dll,so,exe}',
    '**/spawn-helper',
    '**/@vscode/ripgrep-*/bin/rg',
    '**/node_modules/@deepseek-ai/libreoffice-kit*/**/*',
  ],
  files: [
    'lib/**/*',
    'renderer/**/*',
    'package.json',
    { from: dshTargetRoot, to: 'dsh', filter: ['**/*'] },
    { from: join(dshTargetRoot, 'node_modules'), to: 'dsh/node_modules', filter: ['**/*'] },
  ],
  extraResources: [
    {
      from: runtimeTargetRoot,
      to: 'runtime',
      filter: ['**/*'],
    },
    ...(resolvedChatPath ? [{
      from: resolvedChatPath,
      to: 'analog-chat-service',
      filter: ['**/*'],
    }] : []),
    {
      from: join(root, 'resources/icon-windows.png'),
      to: 'icon.png',
    },
    {
      from: join(root, 'resources/tray-windows.ico'),
      to: 'tray.ico',
    },
  ],
  mac: {
    icon: join(root, 'resources/icon-macos.png'),
    category: 'public.app-category.developer-tools',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    identity: null,
  },
  dmg: {
    title: 'Analog Installer',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    icon: join(root, 'resources/icon-windows.png'),
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Analog',
  },
  linux: {
    icon: join(root, 'resources/icon.png'),
    category: 'Development',
    target: [
      { target: 'tar.gz', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
  },
}

export default config
