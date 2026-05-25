import type { NostrEvent } from 'signet-protocol'
import { parsePersonaName } from './parse.js'
import { validatePersonaCredential } from './validate.js'
import type { FetchPersonaHandleOptions, PersonaHandleResult } from './types.js'

const HEX_64 = /^[0-9a-f]{64}$/i
const DEFAULT_RELAY = 'wss://relay.trotters.cc'
const DEFAULT_TIMEOUT_MS = 3000
const ATTESTATION_KIND = 31000

function lower64hex(s: string): string | null {
  return HEX_64.test(s) ? s.toLowerCase() : null
}

/**
 * Subscribe to a relay for a persona's published name credentials, pick the
 * newest non-expired credential that passes validation, and resolve with it.
 *
 * Generalised from axenstax's hand-rolled persona-handle.js with two fixes:
 *   - reads `expiration` tag (NIP-40), not the deprecated `expires`
 *   - accepts a `webSocketFactory` option for testability and Node use
 *
 * Returns `null` on: invalid pubkey, timeout, no matching credential, all
 * credentials expired, or all candidate signatures failing.
 */
export async function fetchPersonaHandle(
  pubkey: string,
  opts: FetchPersonaHandleOptions = {},
): Promise<PersonaHandleResult> {
  const lowered = lower64hex(pubkey)
  if (!lowered) return null

  const relayUrl = opts.relayUrl ?? DEFAULT_RELAY
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs! : DEFAULT_TIMEOUT_MS
  const verify = opts.verify !== false
  const factory =
    opts.webSocketFactory ??
    ((url: string) => new (globalThis as { WebSocket: new (u: string) => WebSocket }).WebSocket(url))

  const events: NostrEvent[] = []
  let ws: WebSocket
  try {
    ws = factory(relayUrl)
  } catch {
    return null
  }

  const subId = 'sch-' + Math.random().toString(36).slice(2, 10)

  return new Promise<PersonaHandleResult>((resolve) => {
    let settled = false
    const timer = setTimeout(() => void finish(), timeoutMs)

    async function finish(): Promise<void> {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch { /* ignore */ }

      const now = Math.floor(Date.now() / 1000)
      const candidates: NostrEvent[] = []
      for (const e of events) {
        if (e.kind !== ATTESTATION_KIND) continue
        if (typeof e.pubkey !== 'string' || e.pubkey.toLowerCase() !== lowered) continue
        const parsed = parsePersonaName(e)
        if (!parsed) continue
        if (parsed.expiresAt !== null && parsed.expiresAt < now) continue
        if (verify) {
          const result = await validatePersonaCredential(e)
          if (!result.valid) continue
        }
        candidates.push(e)
      }

      if (candidates.length === 0) return resolve(null)
      candidates.sort((a, b) => b.created_at - a.created_at)
      resolve(parsePersonaName(candidates[0]!))
    }

    ws.addEventListener('open', () => {
      try {
        ws.send(
          JSON.stringify(['REQ', subId, { kinds: [ATTESTATION_KIND], authors: [lowered], limit: 20 }]),
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
