/** Exercise Messages request conversion with recorded responses from another protocol. */
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { resolveAdapterOptions } from '../../src/config.ts'
import { serialize } from '../../src/serialize.ts'
import { adapter, chunks, server } from '../helpers.ts'

export const name = 'messages-history-snapshot'
export const inject = ['llm']

export async function apply(ctx: Context): Promise<void> {
  const http = await server()
  ctx.effect(() => () => http.close())
  const connection = resolveAdapterOptions({})
  const transport = adapter({ baseURL: http.url })
  ctx.on('llm/stream', async function* (options, next) {
    const expected = serialize(options, connection, options.messages, new Map(), () => undefined)
    await chunks(transport.stream(options))
    assert.deepEqual(http.requests.at(-1)?.body.messages, expected.messages)
    assert.equal(http.requests.at(-1)?.body.system, expected.system)
    yield* next()
  })
}
