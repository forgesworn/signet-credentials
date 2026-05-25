import { verifyEvent } from 'signet-protocol'
import type { NostrEvent, ValidationResult } from 'signet-protocol'

const ATTESTATION_KIND = 31000
const DISPLAY_NAME_MAX_LENGTH = 100

/**
 * Validate a kind-31000 event against the Signet persona-name profile.
 *
 * Structural + cryptographic checks:
 *   - kind === 31000
 *   - `display-name` tag present, non-empty, ≤100 characters
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

  const displayNameTag = event.tags.find(
    (t) => t[0] === 'display-name' && typeof t[1] === 'string',
  )
  if (!displayNameTag || !displayNameTag[1] || displayNameTag[1].length === 0) {
    errors.push('missing required display-name tag')
  } else if (displayNameTag[1].length > DISPLAY_NAME_MAX_LENGTH) {
    errors.push(`display-name length exceeds ${DISPLAY_NAME_MAX_LENGTH} characters`)
  } else if (displayNameTag[1].trim().length === 0) {
    errors.push('display-name must not be whitespace-only')
  }

  const sigOk = await verifyEvent(event)
  if (!sigOk) {
    errors.push('invalid signature or event id')
  }

  return { valid: errors.length === 0, errors }
}
