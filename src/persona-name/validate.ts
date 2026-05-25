import { verifyEvent } from 'signet-protocol'
import type { NostrEvent, ValidationResult } from 'signet-protocol'

const ATTESTATION_KIND = 31000

/**
 * Validate a kind-31000 event against the Signet persona-name profile.
 *
 * Structural + cryptographic checks:
 *   - kind === 31000
 *   - `display-name` tag present and non-empty
 *   - signet-protocol's `verifyEvent` passes (recomputes event id AND
 *     verifies the Schnorr signature against the pubkey)
 *
 * Does NOT check whether the credential is currently in-date — that's the
 * caller's job. Use `parsePersonaName(event).expiresAt` plus a clock.
 */
export async function validatePersonaCredential(
  event: NostrEvent,
): Promise<ValidationResult> {
  const errors: string[] = []

  if (event.kind !== ATTESTATION_KIND) {
    errors.push(`kind must be ${ATTESTATION_KIND}`)
  }

  const hasDisplayName = event.tags.some(
    (t) => t[0] === 'display-name' && typeof t[1] === 'string' && t[1].length > 0,
  )
  if (!hasDisplayName) {
    errors.push('missing required display-name tag')
  }

  const sigOk = await verifyEvent(event)
  if (!sigOk) {
    errors.push('invalid signature or event id')
  }

  return { valid: errors.length === 0, errors }
}
