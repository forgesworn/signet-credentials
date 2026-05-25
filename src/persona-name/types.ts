import type { NostrEvent } from 'signet-protocol'

/** Parsed Signet persona-name credential. */
export interface PersonaName {
  /** Subject pubkey (hex, 64 chars, lowercase). */
  pubkey: string
  /** Human-facing display name from the `display-name` tag. */
  displayName: string
  /** Unix seconds; null when the credential carries no `expiration` tag. */
  expiresAt: number | null
  /** Optional id of the credential this one supersedes. */
  supersedes?: string
  /** Event id (hex). */
  credentialId: string
  /** Original signed event for callers that need it (e.g. JoinRequest passthrough). */
  rawEvent: NostrEvent
}

export interface PersonaNameCredentialOptions {
  /** Seconds from now until expiry. Default: 365 days. */
  expirySeconds?: number
  /** Id of a previous persona-name credential being superseded. */
  supersedesId?: string
}

export interface FetchPersonaHandleOptions {
  /** Relay URL. Default: `wss://relay.trotters.cc`. */
  relayUrl?: string
  /** Subscription deadline in ms. Default: 3000. */
  timeoutMs?: number
  /** Verify Schnorr signature + event id. Default: true. */
  verify?: boolean
  /** Caller-supplied WebSocket factory (Node/browser). Default: global `WebSocket`. */
  webSocketFactory?: (url: string) => WebSocket
}

export type PersonaHandleResult = PersonaName | null
