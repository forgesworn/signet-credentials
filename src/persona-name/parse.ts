import type { NostrEvent } from 'signet-protocol'
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
 * tag. Does NOT verify signatures — pair with {@link validatePersonaCredential}
 * for full verification, or rely on the relay's signature checks when
 * freshness isn't the threat model.
 *
 * Reads `expiration` (NIP-40), not `expires`. Hand-rolled consumers that
 * read `expires` were silently fail-open on expiry.
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
    displayName: displayName.slice(0, 100),
    expiresAt: expiresAt !== null && !isNaN(expiresAt) ? expiresAt : null,
    supersedes,
    credentialId: event.id,
    rawEvent: event,
  }
}
