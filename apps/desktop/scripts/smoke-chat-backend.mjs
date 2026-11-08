/** Launch the packaged Chat service and require readiness on its shipped port before publication. */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { connect } from 'node:net'
import { setTimeout } from 'node:timers/promises'

const executable = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Usage: node smoke-chat-backend.mjs <executable>')
const occupied = await new Promise(resolveResult => {
  const socket = connect({ host: '127.0.0.1', port: 8071 })
  socket.setTimeout(1000)
  socket.once('connect', () => { socket.destroy(); resolveResult(true) })
  socket.once('error', () => { socket.destroy(); resolveResult(false) })
  socket.once('timeout', () => { socket.destroy(); resolveResult(true) })
})
if (occupied) throw new Error('Chat smoke requires unused port 8071; stop the existing service first')

const data = await mkdtemp(join(tmpdir(), 'analog-chat-smoke-'))
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
let output = ''
let failure
let finished = false
const child = spawn(executable, [], {
  cwd: dirname(executable),
  env: { ...env, PORT: '8071', ANALOGAI_DATA_DIR: data, SQLITE_DB_PATH: join(data, 'chat.db') },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
const closed = new Promise(resolveClosed => {
  child.once('error', error => { failure = error })
  child.once('close', (code, signal) => {
    finished = true
    failure ??= new Error(`Chat exited before readiness: code=${code}, signal=${signal}`)
    resolveClosed()
  })
})
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', chunk => { output = (output + chunk.toString()).slice(-16000) })
}
try {
  const deadline = Date.now() + 180000
  let ready = false
  while (Date.now() < deadline) {
    if (failure) throw failure
    try {
      const response = await fetch('http://127.0.0.1:8071/health', { signal: AbortSignal.timeout(1000) })
      ready = response.ok && (await response.json()).status === 'ok'
    } catch (error) {
      // Connection refusal is expected until the executable finishes importing and binding.
      if (!(error instanceof Error)) throw error
    }
    if (ready) break
    await setTimeout(250)
  }
  if (!ready || finished) throw failure ?? new Error('Chat did not become healthy within 180 seconds')
  console.log(`Chat backend ready on http://127.0.0.1:8071: ${executable}`)
} catch (error) {
  console.error(output)
  throw error
} finally {
  if (!finished) {
    if (process.platform === 'win32' && child.pid) {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  }
  await closed
  await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
