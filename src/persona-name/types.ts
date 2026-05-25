import type { NostrEvent } from 'signet-protocol'

/** Parsed Signet persona-name credential. */
export interface PersonaName {
  /** Subject pubkey (hex, 64 chars, lowercase). */
  pubkey: string
  /** Raw `display-name` tag value. May exceed the 100-char protocol limit;
   * `validatePersonaCredential` rejects, `parsePersonaName` passes through. */
  displayName: string
  /** Unix seconds. `null` when the credential carries no `expiration` tag
   * (the protocol's NIP-40 expiration is optional). Fail-closed consumers
   * should reject `null` — use `parseValidPersonaName` to get that for free. */
  expiresAt: number | null
  /** Optional id of the credential this one supersedes. */
  supersedes?: string
  /** Event id (hex). */
  credentialId: string
  /** Original signed event for callers that need it (e.g. JoinRequest passthrough). */
  rawEvent: NostrEvent
}

/** The scope of the underlying self-attestation. */
export type PersonaNameScope = 'adult' | 'adult+child'

export interface BuildPersonaNameCredentialOptions {
  /** Scope of the underlying self-attestation. Required — no sensible default
   * for a display-name credential (the scope concept doesn't apply to a name
   * but the protocol's credential model requires it). Callers must declare. */
  scope: PersonaNameScope
  /** Seconds from now until expiry. Default: 365 days. */
  expirySeconds?: number
  /** Id of a previous persona-name credential being superseded. */
  supersedesId?: string
}

export interface FetchPersonaHandleOptions {
  /** Relay URLs to query in parallel. Required, non-empty.
   *
   * The lib deliberately ships no default — it is profile-agnostic and
   * shouldn't bake in any one operator's relay. Consumers pick their
   * own (or read NIP-65 outbox relays via their preferred resolver). */
  relayUrls: string[]
  /** Per-relay subscription deadline in ms. Default: 3000. */
  timeoutMs?: number
  /** Verify Schnorr signature + event id. Default: true. */
  verify?: boolean
  /** Advanced: caller-supplied WebSocket factory. Default uses
   * `globalThis.WebSocket` (browser + Node ≥22). Override only when running
   * on older Node or when injecting a fake transport in tests. */
  webSocketFactory?: (url: string) => WebSocket
}

/**
 * Discriminated union of all possible outcomes from {@link fetchPersonaHandle}.
 *
 * Distinguishing these states matters: a UI showing "no name set" when
 * the relay was actually unreachable is fail-open. Consumers must switch
 * on `status` rather than treating any non-`ok` result as the same.
 */
export type FetchPersonaHandleResult =
  | { status: 'ok'; credential: PersonaName }
  | { status: 'not-found' }
  | { status: 'all-expired' }
  | { status: 'all-invalid' }
  | { status: 'timeout' }
  | { status: 'invalid-input' }
  | { status: 'transport-error'; error: unknown }
