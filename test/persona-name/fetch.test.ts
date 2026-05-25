import { describe, test, expect } from 'vitest'
import { fetchPersonaHandle } from '../../src/persona-name/fetch.js'
import { makePersonaNameCredential, generatePrivateKeyHex } from '../fixtures.js'
import type { NostrEvent } from 'signet-protocol'

/**
 * Minimal stand-in for `WebSocket`. The lib only uses: `addEventListener`
 * for 'open' | 'message' | 'error' | 'close', `send`, `close`.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  private listeners: Record<string, Array<(evt: unknown) => void>> = {}
  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(name: string, cb: (evt: unknown) => void): void {
    if (!this.listeners[name]) this.listeners[name] = []
    this.listeners[name].push(cb)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.closed = true
    this.fire('close', {})
  }

  // Test helpers
  fire(name: string, evt: unknown): void {
    for (const cb of this.listeners[name] ?? []) cb(evt)
  }

  fireOpen(): void {
    this.fire('open', {})
  }

  deliverEvent(subId: string, event: NostrEvent): void {
    this.fire('message', { data: JSON.stringify(['EVENT', subId, event]) })
  }

  deliverEose(subId: string): void {
    this.fire('message', { data: JSON.stringify(['EOSE', subId]) })
  }
}

function parseReq(payload: string): { subId: string; filter: Record<string, unknown> } {
  const arr = JSON.parse(payload) as unknown[]
  if (!Array.isArray(arr) || arr[0] !== 'REQ') throw new Error('not REQ')
  return { subId: arr[1] as string, filter: arr[2] as Record<string, unknown> }
}

describe('fetchPersonaHandle', () => {
  test('returns the newest valid credential when multiple are delivered', async () => {
    FakeWebSocket.instances = []

    const sk = generatePrivateKeyHex()
    const now = Math.floor(Date.now() / 1000)
    const future = now + 86_400

    const older = await makePersonaNameCredential({
      displayName: 'OldName',
      privateKeyHex: sk,
      createdAt: now - 1_000,
      expiresAt: future,
    })
    const newer = await makePersonaNameCredential({
      displayName: 'NewName',
      privateKeyHex: sk,
      createdAt: now,
      expiresAt: future,
    })

    const promise = fetchPersonaHandle(older.pubkeyHex, {
      relayUrl: 'wss://test',
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })

    // Drive the fake socket
    await Promise.resolve()
    const ws = FakeWebSocket.instances[0]!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, older.event)
    ws.deliverEvent(subId, newer.event)
    ws.deliverEose(subId)

    const result = await promise
    expect(result).not.toBeNull()
    expect(result!.displayName).toBe('NewName')
    expect(ws.closed).toBe(true)
  })

  test('returns null when no credentials are delivered (EOSE with empty set)', async () => {
    FakeWebSocket.instances = []
    const sk = generatePrivateKeyHex()
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle', privateKeyHex: sk })

    const promise = fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrl: 'wss://test',
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.instances[0]!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEose(subId)

    expect(await promise).toBeNull()
  })

  test('skips credentials whose expiration is in the past', async () => {
    FakeWebSocket.instances = []
    const sk = generatePrivateKeyHex()
    const past = Math.floor(Date.now() / 1000) - 86_400

    const expired = await makePersonaNameCredential({
      displayName: 'ExpiredName',
      privateKeyHex: sk,
      expiresAt: past,
    })

    const promise = fetchPersonaHandle(expired.pubkeyHex, {
      relayUrl: 'wss://test',
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.instances[0]!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, expired.event)
    ws.deliverEose(subId)

    expect(await promise).toBeNull()
  })

  test('rejects events that fail signature verification when verify:true', async () => {
    FakeWebSocket.instances = []
    const sk = generatePrivateKeyHex()
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle', privateKeyHex: sk })
    const tampered = { ...fixture.event, sig: 'c'.repeat(128) }

    const promise = fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrl: 'wss://test',
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.instances[0]!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, tampered)
    ws.deliverEose(subId)

    expect(await promise).toBeNull()
  })

  test('returns null for invalid pubkey input without opening a socket', async () => {
    FakeWebSocket.instances = []
    const result = await fetchPersonaHandle('not-hex', {
      relayUrl: 'wss://test',
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })
    expect(result).toBeNull()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  test('respects the timeoutMs option and returns null when nothing arrives', async () => {
    FakeWebSocket.instances = []
    const sk = generatePrivateKeyHex()
    const pubkey = (await makePersonaNameCredential({ displayName: 'x', privateKeyHex: sk })).pubkeyHex

    const start = Date.now()
    const promise = fetchPersonaHandle(pubkey, {
      relayUrl: 'wss://test',
      timeoutMs: 50,
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.instances[0]!
    ws.fireOpen()
    // Never deliver EOSE — let the timer fire.

    const result = await promise
    const elapsed = Date.now() - start
    expect(result).toBeNull()
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(500)
  })
})
