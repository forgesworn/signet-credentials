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
  static byUrl: Record<string, FakeWebSocket> = {}
  readonly url: string
  private listeners: Record<string, Array<(evt: unknown) => void>> = {}
  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
    FakeWebSocket.byUrl[url] = this
  }

  static reset(): void {
    FakeWebSocket.instances = []
    FakeWebSocket.byUrl = {}
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

const factory = (url: string) => new FakeWebSocket(url) as unknown as WebSocket

describe('fetchPersonaHandle', () => {
  test('returns {status: "ok"} with the newest valid credential from a single relay', async () => {
    FakeWebSocket.reset()
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
      relayUrls: ['wss://test'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.byUrl['wss://test']!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, older.event)
    ws.deliverEvent(subId, newer.event)
    ws.deliverEose(subId)

    const result = await promise
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.credential.displayName).toBe('NewName')
    expect(ws.closed).toBe(true)
  })

  test('queries multiple relays in parallel and picks the newest valid credential across all', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const now = Math.floor(Date.now() / 1000)
    const future = now + 86_400

    const relayAEvent = await makePersonaNameCredential({
      displayName: 'FromRelayA',
      privateKeyHex: sk,
      createdAt: now - 1_000,
      expiresAt: future,
    })
    const relayBEvent = await makePersonaNameCredential({
      displayName: 'FromRelayB-Newest',
      privateKeyHex: sk,
      createdAt: now,
      expiresAt: future,
    })

    const promise = fetchPersonaHandle(relayAEvent.pubkeyHex, {
      relayUrls: ['wss://a', 'wss://b'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    expect(FakeWebSocket.instances).toHaveLength(2)
    const wsA = FakeWebSocket.byUrl['wss://a']!
    const wsB = FakeWebSocket.byUrl['wss://b']!

    wsA.fireOpen()
    wsB.fireOpen()
    const { subId: subA } = parseReq(wsA.sent[0]!)
    const { subId: subB } = parseReq(wsB.sent[0]!)
    wsA.deliverEvent(subA, relayAEvent.event)
    wsA.deliverEose(subA)
    wsB.deliverEvent(subB, relayBEvent.event)
    wsB.deliverEose(subB)

    const result = await promise
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.credential.displayName).toBe('FromRelayB-Newest')
  })

  test('returns {status: "ok"} when only one of several relays has the credential', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const future = Math.floor(Date.now() / 1000) + 86_400

    const fixture = await makePersonaNameCredential({
      displayName: 'OnlyOnB',
      privateKeyHex: sk,
      expiresAt: future,
    })

    const promise = fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrls: ['wss://a', 'wss://b'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const wsA = FakeWebSocket.byUrl['wss://a']!
    const wsB = FakeWebSocket.byUrl['wss://b']!
    wsA.fireOpen()
    wsB.fireOpen()
    const { subId: subA } = parseReq(wsA.sent[0]!)
    const { subId: subB } = parseReq(wsB.sent[0]!)
    wsA.deliverEose(subA)
    wsB.deliverEvent(subB, fixture.event)
    wsB.deliverEose(subB)

    const result = await promise
    expect(result.status).toBe('ok')
  })

  test('returns {status: "not-found"} when relay delivers no credentials', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle', privateKeyHex: sk })

    const promise = fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrls: ['wss://test'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.byUrl['wss://test']!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEose(subId)

    const result = await promise
    expect(result.status).toBe('not-found')
  })

  test('returns {status: "all-expired"} when every candidate has past expiration', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const past = Math.floor(Date.now() / 1000) - 86_400

    const expired = await makePersonaNameCredential({
      displayName: 'ExpiredName',
      privateKeyHex: sk,
      expiresAt: past,
    })

    const promise = fetchPersonaHandle(expired.pubkeyHex, {
      relayUrls: ['wss://test'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.byUrl['wss://test']!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, expired.event)
    ws.deliverEose(subId)

    const result = await promise
    expect(result.status).toBe('all-expired')
  })

  test('returns {status: "all-invalid"} when every candidate fails signature verification', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      privateKeyHex: sk,
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    })
    const tampered = { ...fixture.event, sig: 'c'.repeat(128) }

    const promise = fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrls: ['wss://test'],
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.byUrl['wss://test']!
    ws.fireOpen()
    const { subId } = parseReq(ws.sent[0]!)
    ws.deliverEvent(subId, tampered)
    ws.deliverEose(subId)

    const result = await promise
    expect(result.status).toBe('all-invalid')
  })

  test('returns {status: "invalid-input"} for malformed pubkey without opening any socket', async () => {
    FakeWebSocket.reset()
    const result = await fetchPersonaHandle('not-hex', {
      relayUrls: ['wss://test'],
      webSocketFactory: factory,
    })
    expect(result.status).toBe('invalid-input')
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  test('returns {status: "invalid-input"} when relayUrls is missing or empty', async () => {
    FakeWebSocket.reset()
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })

    const noRelay = await fetchPersonaHandle(fixture.pubkeyHex, {
      relayUrls: [],
      webSocketFactory: factory,
    })
    expect(noRelay.status).toBe('invalid-input')
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  test('returns {status: "timeout"} when the relay never responds', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const pubkey = (await makePersonaNameCredential({
      displayName: 'x',
      privateKeyHex: sk,
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    })).pubkeyHex

    const start = Date.now()
    const promise = fetchPersonaHandle(pubkey, {
      relayUrls: ['wss://test'],
      timeoutMs: 50,
      webSocketFactory: factory,
    })

    await Promise.resolve()
    const ws = FakeWebSocket.byUrl['wss://test']!
    ws.fireOpen()
    // Never deliver EOSE — let the timer fire.

    const result = await promise
    const elapsed = Date.now() - start
    expect(result.status).toBe('timeout')
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(500)
  })

  test('returns {status: "transport-error"} when the WebSocket factory throws', async () => {
    FakeWebSocket.reset()
    const sk = generatePrivateKeyHex()
    const pubkey = (await makePersonaNameCredential({
      displayName: 'x',
      privateKeyHex: sk,
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    })).pubkeyHex

    const result = await fetchPersonaHandle(pubkey, {
      relayUrls: ['wss://broken'],
      webSocketFactory: () => { throw new Error('boom') },
    })
    expect(result.status).toBe('transport-error')
  })
})
