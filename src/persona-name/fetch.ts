import type { FetchPersonaHandleOptions, PersonaHandleResult } from './types.js'

const HEX_64 = /^[0-9a-f]{64}$/i
const DEFAULT_RELAY = 'wss://relay.trotters.cc'
const DEFAULT_TIMEOUT_MS = 3000
const ATTESTATION_KIND = 31000

/**
 * Subscribe to a relay for a persona's published name credentials, pick the
 * newest non-expired credential that passes validation, and resolve with it.
 *
 * Generalised from axenstax's hand-rolled persona-handle.js, with the
 * `expires`/`expiration` tag bug fixed.
 *
 * Returns `null` on: invalid pubkey, timeout, relay error, no matching
 * credential, all credentials expired, or signature verification failed.
 *
 * Caller-supplied `webSocketFactory` lets this run under Node (via `ws`) or
 * any embedding host. Defaults to the global `WebSocket` (browser, modern
 * Node 22+).
 */
export async function fetchPersonaHandle(
  pubkey: string,
  opts: FetchPersonaHandleOptions = {},
): Promise<PersonaHandleResult> {
  // TODO(skeleton): port body from axenstax/tools/sites/game/static/persona-handle.js
  //   with three changes:
  //     1. Fix expires→expiration tag name (the bug).
  //     2. Delegate parse+validate to parsePersonaName + validatePersonaCredential.
  //     3. Accept webSocketFactory for Node compatibility.
  void pubkey
  void opts
  void HEX_64
  void DEFAULT_RELAY
  void DEFAULT_TIMEOUT_MS
  void ATTESTATION_KIND
  return null
}
