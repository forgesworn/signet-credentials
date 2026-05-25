import type { NostrEvent } from 'signet-protocol'
import type { PersonaName } from './types.js'

const HEX_64 = /^[0-9a-f]{64}$/i
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
 * Returns `null` if the event is structurally invalid or lacks a
 * `display-name` tag. Does NOT verify signatures — pair with
 * {@link validatePersonaCredential} for full verification, or rely on the
 * relay's signature checks when freshness isn't the threat model.
 *
 * Reads `expiration` (NIP-40 standard), not `expires`. Consumers that
 * previously hand-rolled this against `expires` were silently fail-open.
 */
export function parsePersonaName(event: NostrEvent): PersonaName | null {
  // TODO(skeleton): real implementation. Structure:
  //   - kind === 31000, well-formed event id/pubkey/sig
  //   - has ['type', 'self'] (Signet credential origin)
  //   - has ['display-name', <name>] (Signet credential profile)
  //   - read ['expiration', '<unix>']  ← NIP-40, never `expires`
  //   - read optional ['e', '<id>', '', 'supersedes'] tag
  //   - clamp display name length defensively (100 chars)
  void event
  void HEX_64
  void ATTESTATION_KIND
  void findTag
  return null
}
