import { existsSync, mkdirSync, createWriteStream, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const repoRoot = resolve(desktopRoot, '../..')
const prebuiltDir = join(desktopRoot, 'prebuilt')
const prebuiltChatDir = join(prebuiltDir, 'analog-chat-service')

// Check if sibling chat repo already has a locally compiled dist
const localChatDist = resolve(repoRoot, '../chat/dist/analog-chat-service')
const localChatWinDist = resolve(repoRoot, '../chat/dist/analog-chat-service-win/analog-chat-service')

export async function ensurePrebuiltChatBackend() {
  const isWin = process.platform === 'win32'
  const exeName = isWin ? 'analog-chat-service.exe' : 'analog-chat-service'

  // 1. Check if locally compiled in chat/dist
  if (existsSync(join(localChatDist, exeName))) {
    console.log(`[fetch-backend] Found locally compiled chat backend in ${localChatDist}`)
    return localChatDist
  }
  if (existsSync(join(localChatWinDist, exeName))) {
    console.log(`[fetch-backend] Found locally compiled chat backend in ${localChatWinDist}`)
    return localChatWinDist
  }

  // 2. Check if already downloaded in apps/desktop/prebuilt
  if (existsSync(join(prebuiltChatDir, exeName))) {
    console.log(`[fetch-backend] Found cached prebuilt chat backend in ${prebuiltChatDir}`)
    return prebuiltChatDir
  }

  // 3. Determine target architecture
  const targetPlatform = process.env.DSH_DESKTOP_TARGET_PLATFORM || (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux')
  const targetArch = process.env.DSH_DESKTOP_TARGET_ARCH || process.arch

  let targetKey = 'mac-arm64'
  let ext = 'tar.gz'

  if (targetPlatform === 'win32') {
    targetKey = 'win-x64'
    ext = 'zip'
  } else if (targetPlatform === 'darwin') {
    targetKey = targetArch === 'x64' ? 'mac-x64' : 'mac-arm64'
    ext = 'tar.gz'
  } else if (targetPlatform === 'linux') {
    targetKey = 'linux-x64'
    ext = 'tar.gz'
  }

  const assetName = `analog-chat-service-${targetKey}.${ext}`
  const tag = process.env.ANALOG_CHAT_TAG || 'latest'
  const token = process.env.GH_PAT || process.env.ANALOG_CI_PAT || process.env.GITHUB_TOKEN

  console.log(`[fetch-backend] Downloading prebuilt backend asset '${assetName}' (tag: ${tag}) from analogai-org/chat...`)

  mkdirSync(prebuiltDir, { recursive: true })
  const archivePath = join(prebuiltDir, assetName)

  // Determine asset download URL
  let downloadUrl = `https://github.com/analogai-org/chat/releases/download/${tag}/${assetName}`
  if (tag === 'latest') {
    downloadUrl = `https://github.com/analogai-org/chat/releases/latest/download/${assetName}`
  }

  const headers = {
    'User-Agent': 'analog-harness-build',
    'Accept': 'application/octet-stream',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await fetch(downloadUrl, { headers, redirect: 'follow' })
    if (!res.ok) {
      // If direct tag url fails, try releases API lookup
      console.warn(`[fetch-backend] Direct asset download returned ${res.status}. Querying GitHub Releases API...`)
      const apiHeaders = {
        'User-Agent': 'analog-harness-build',
        'Accept': 'application/vnd.github+json',
      }
      if (token) {
        apiHeaders['Authorization'] = `Bearer ${token}`
      }
      const relApiUrl = tag === 'latest'
        ? 'https://api.github.com/repos/analogai-org/chat/releases/latest'
        : `https://api.github.com/repos/analogai-org/chat/releases/tags/${tag}`
      
      const relRes = await fetch(relApiUrl, { headers: apiHeaders })
      if (!relRes.ok) {
        throw new Error(`Failed to query release info from GitHub API: ${relRes.status} ${relRes.statusText}`)
      }
      const relData = await relRes.json()
      const asset = relData.assets?.find(a => a.name === assetName)
      if (!asset) {
        throw new Error(`Asset '${assetName}' not found in release '${relData.tag_name || tag}'. Available assets: ${relData.assets?.map(a => a.name).join(', ')}`)
      }

      console.log(`[fetch-backend] Found asset URL: ${asset.url}`)
      const assetRes = await fetch(asset.url, {
        headers: {
          ...apiHeaders,
          'Accept': 'application/octet-stream',
        },
        redirect: 'follow',
      })
      if (!assetRes.ok) {
        throw new Error(`Failed to download release asset: ${assetRes.status} ${assetRes.statusText}`)
      }
      const fileStream = createWriteStream(archivePath)
      await pipeline(Readable.fromWeb(assetRes.body), fileStream)
    } else {
      const fileStream = createWriteStream(archivePath)
      await pipeline(Readable.fromWeb(res.body), fileStream)
    }

    console.log(`[fetch-backend] Downloaded ${archivePath}. Extracting into ${prebuiltDir}...`)

    // Clean any prior partial extraction
    if (existsSync(prebuiltChatDir)) {
      rmSync(prebuiltChatDir, { recursive: true, force: true })
    }

    if (ext === 'tar.gz') {
      execFileSync('tar', ['-xzf', archivePath, '-C', prebuiltDir], { stdio: 'inherit' })
    } else if (ext === 'zip') {
      if (process.platform === 'win32') {
        execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${archivePath}' -DestinationPath '${prebuiltDir}' -Force`], { stdio: 'inherit' })
      } else {
        execFileSync('unzip', ['-o', archivePath, '-d', prebuiltDir], { stdio: 'inherit' })
      }
    }

    // Clean up archive
    try {
      rmSync(archivePath, { force: true })
    } catch {
      // ignore
    }

    const binaryExecPath = join(prebuiltChatDir, exeName)
    if (!existsSync(binaryExecPath)) {
      throw new Error(`[fetch-backend] Extraction completed but executable not found at: ${binaryExecPath}`)
    }

    if (process.platform !== 'win32') {
      try {
        chmodSync(binaryExecPath, 0o755)
      } catch (e) {
        console.warn(`[fetch-backend] chmod warning: ${e.message}`)
      }
    }

    console.log(`[fetch-backend] Successfully prepared prebuilt backend at: ${prebuiltChatDir}`)
    return prebuiltChatDir
  } catch (err) {
    console.error(`[fetch-backend] Warning/Error fetching prebuilt backend: ${err.message}`)
    console.error(`[fetch-backend] You can manually build the chat microservice or download ${assetName} to ${prebuiltDir}`)
    return null
  }
}

// Execute if run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  ensurePrebuiltChatBackend().catch(err => {
    console.error('[fetch-backend] Fatal error:', err)
    process.exit(1)
  })
}
