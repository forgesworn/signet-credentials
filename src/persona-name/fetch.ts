import type { NostrEvent } from 'signet-protocol'
import { parsePersonaName } from './parse.js'
import { validatePersonaCredential } from './validate.js'
import type { FetchPersonaHandleOptions, FetchPersonaHandleResult, PersonaName } from './types.js'

const HEX_64 = /^[0-9a-f]{64}$/i
const DEFAULT_TIMEOUT_MS = 3000
const ATTESTATION_KIND = 31000

type SingleRelayResult =
  | { status: 'ok'; credential: PersonaName }
  | { status: 'not-found' }
  | { status: 'all-expired' }
  | { status: 'all-invalid' }
  | { status: 'timeout' }
  | { status: 'transport-error'; error: unknown }

function lower64hex(s: string): string | null {
  return HEX_64.test(s) ? s.toLowerCase() : null
}

function defaultWebSocketFactory(url: string): WebSocket {
  return new (globalThis as { WebSocket: new (u: string) => WebSocket }).WebSocket(url)
}

/**
 * Subscribe to N relays in parallel for a persona's published name
 * credentials. Returns a discriminated union so consumers can distinguish
 * "no credential" from "relay unreachable" — a UI showing "no name set"
 * when the relay was down is a fail-open hazard.
 *
 * Multi-relay semantics:
 *   - All relays queried in parallel.
 *   - When at least one relay returns a valid non-expired credential, the
 *     overall result is `ok` with the newest credential across all relays
 *     (sorted by `created_at`).
 *   - When no relay returns a valid credential, the aggregate status is
 *     determined by the most-informative single-relay status seen:
 *     `all-expired` > `all-invalid` > `not-found` > `transport-error`/`timeout`.
 *
 * Behaviour per relay:
 *   - Subscribes to `kinds: [31000], authors: [pubkey]` with `limit: 20`.
 *   - Parses each event with {@link parsePersonaName}.
 *   - Verifies signatures via {@link validatePersonaCredential} when
 *     `verify: true` (default).
 *   - Skips credentials with `expiresAt` in the past or absent.
 *
 * Known limitation: ordering across relays is by `created_at`, not a
 * supersession-chain walk. A future minor will add chain-aware selection
 * and NIP-65 outbox resolution.
 */
export async function fetchPersonaHandle(
  pubkey: string,
  opts: FetchPersonaHandleOptions,
): Promise<FetchPersonaHandleResult> {
  const lowered = lower64hex(pubkey)
  if (!lowered) return { status: 'invalid-input' }
  if (!opts.relayUrls || opts.relayUrls.length === 0) {
    return { status: 'invalid-input' }
  }

  const factory = opts.webSocketFactory ?? defaultWebSocketFactory
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs! : DEFAULT_TIMEOUT_MS
  const verify = opts.verify !== false

  const perRelay = await Promise.all(
    opts.relayUrls.map((url) =>
      fetchFromOneRelay({ pubkey: lowered, relayUrl: url, factory, timeoutMs, verify }),
    ),
  )

  // Combine: collect all 'ok' candidates → pick newest by created_at across all relays.
  const okResults = perRelay.filter((r): r is { status: 'ok'; credential: PersonaName } => r.status === 'ok')
  if (okResults.length > 0) {
    const winner = okResults
      .map((r) => r.credential)
      .sort((a, b) => b.rawEvent.created_at - a.rawEvent.created_at)[0]!
    return { status: 'ok', credential: winner }
  }

  // No relay had a valid credential. Pick the most-informative fallback status.
  if (perRelay.some((r) => r.status === 'all-expired')) return { status: 'all-expired' }
  if (perRelay.some((r) => r.status === 'all-invalid')) return { status: 'all-invalid' }
  if (perRelay.some((r) => r.status === 'not-found')) return { status: 'not-found' }

  const transportErr = perRelay.find(
    (r): r is { status: 'transport-error'; error: unknown } => r.status === 'transport-error',
  )
  if (transportErr) return transportErr
  return { status: 'timeout' }
}

interface SingleRelayParams {
  pubkey: string
  relayUrl: string
  factory: (url: string) => WebSocket
  timeoutMs: number
  verify: boolean
}

function fetchFromOneRelay(params: SingleRelayParams): Promise<SingleRelayResult> {
  const { pubkey, relayUrl, factory, timeoutMs, verify } = params
  const events: NostrEvent[] = []

  let ws: WebSocket
  try {
    ws = factory(relayUrl)
  } catch (error) {
    return Promise.resolve({ status: 'transport-error', error })
  }

  const subId = 'spn-' + Math.random().toString(36).slice(2, 10)

  return new Promise<SingleRelayResult>((resolve) => {
    let settled = false
    let didTimeout = false
    const timer = setTimeout(() => {
      didTimeout = true
      void finish()
    }, timeoutMs)

    async function finish(): Promise<void> {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch { /* ignore */ }

      const now = Math.floor(Date.now() / 1000)
      let sawAny = false
      let sawExpired = false
      let sawValid = false
      const candidates: NostrEvent[] = []

      for (const e of events) {
        if (e.kind !== ATTESTATION_KIND) continue
        if (typeof e.pubkey !== 'string' || e.pubkey.toLowerCase() !== pubkey) continue
        const parsed = parsePersonaName(e)
        if (!parsed) continue
        sawAny = true
        if (parsed.expiresAt !== null && parsed.expiresAt < now) {
          sawExpired = true
          continue
        }
        if (verify) {
          const v = await validatePersonaCredential(e)
          if (!v.valid) continue
        }
        sawValid = true
        candidates.push(e)
      }

      if (candidates.length === 0) {
        if (!sawAny) return resolve(didTimeout ? { status: 'timeout' } : { status: 'not-found' })
        if (sawExpired && !sawValid) return resolve({ status: 'all-expired' })
        return resolve({ status: 'all-invalid' })
      }

      candidates.sort((a, b) => b.created_at - a.created_at)
      const winner = parsePersonaName(candidates[0]!)
      if (!winner) return resolve({ status: 'all-invalid' })
      return resolve({ status: 'ok', credential: winner })
    }

    ws.addEventListener('open', () => {
      try {
        ws.send(
          JSON.stringify(['REQ', subId, { kinds: [ATTESTATION_KIND], authors: [pubkey], limit: 20 }]),
        )
      } catch {
        void finish()
      }
    })

    ws.addEventListener('message', (evt: MessageEvent) => {
      let msg: unknown
      try { msg = JSON.parse(typeof evt.data === 'string' ? evt.data : '') } catch { return }
      if (!Array.isArray(msg)) return
      if (msg[0] === 'EVENT' && msg[1] === subId && msg[2] && typeof msg[2] === 'object') {
        events.push(msg[2] as NostrEvent)
      } else if ((msg[0] === 'EOSE' || msg[0] === 'CLOSED') && msg[1] === subId) {
        void finish()
      }
    })

    ws.addEventListener('error', () => { /* let timer or close handle it */ })
    ws.addEventListener('close', () => { void finish() })
  })
}
