import type { NostrEvent } from 'signet-protocol'
import { validatePersonaCredential } from './validate.js'
import type { PersonaName } from './types.js'

const ATTESTATION_KIND = 31000

function findTag(tags: string[][], name: string): string | null {
  for (const t of tags) {
    if (t[0] === name && typeof t[1] === 'string') return t[1]
  }
  return null
}

/**
 * Parse a kind-31000 event as a Signet persona-name credential.
 *
 * Returns `null` if the event is the wrong kind or lacks a `display-name`
 * tag. Does NOT verify signatures, does NOT check length limits, does NOT
 * reject expired credentials. For all those checks in one call, use
 * {@link parseValidPersonaName} — that's the primary fail-closed API.
 *
 * Reads `expiration` (NIP-40), not the deprecated `expires` tag. Hand-rolled
 * consumers that read `expires` were silently fail-open on expiry.
 */
export function parsePersonaName(event: NostrEvent): PersonaName | null {
  if (event.kind !== ATTESTATION_KIND) return null

  const displayName = findTag(event.tags, 'display-name')
  if (!displayName) return null

  const expirationStr = findTag(event.tags, 'expiration')
  const expiresAt = expirationStr !== null ? parseInt(expirationStr, 10) : null

  const supersedes = findTag(event.tags, 'supersedes') ?? undefined

  return {
    pubkey: event.pubkey,
    displayName,
    expiresAt: expiresAt !== null && !isNaN(expiresAt) ? expiresAt : null,
    supersedes,
    credentialId: event.id,
    rawEvent: event,
  }
}

/**
 * Primary fail-closed API. Parses, validates (structure + signature +
 * length), AND rejects credentials that have no explicit expiration or
 * whose expiration is in the past.
 *
 * Returns `null` on any failure. Use this when you have a single event
 * in hand (e.g. inbound JoinRequest passthrough) and want a one-line
 * "trust this or don't" answer. For relay queries, use {@link fetchPersonaHandle}.
 */
export async function parseValidPersonaName(
  event: NostrEvent,
  nowUnix?: number,
): Promise<PersonaName | null> {
  const validation = await validatePersonaCredential(event)
  if (!validation.valid) return null

  const parsed = parsePersonaName(event)
  if (!parsed) return null

  // Fail-closed: reject credentials lacking an explicit expiration tag.
  if (parsed.expiresAt === null) return null

  const now = nowUnix ?? Math.floor(Date.now() / 1000)
  if (parsed.expiresAt < now) return null

  return parsed
}
