import type { NostrEvent, ValidationResult } from 'signet-protocol'

/**
 * Validate a kind-31000 event against the Signet persona-name profile.
 *
 * Structural + cryptographic checks:
 *   - kind === 31000
 *   - well-formed event id (recomputed and compared)
 *   - Schnorr signature verified against pubkey
 *   - `type: 'self'` tag present
 *   - `display-name` tag present and non-empty
 *   - `expiration` tag, when present, is a parseable unix timestamp
 *
 * Does NOT check whether the credential is currently in-date — that's the
 * caller's job. Use `parsePersonaName(event).expiresAt` plus a clock.
 */
export function validatePersonaCredential(event: NostrEvent): ValidationResult {
  // TODO(skeleton): real implementation. Delegate base structure to
  // signet-protocol's verifyCredential where possible, then layer the
  // Signet persona-name profile checks on top (display-name tag presence,
  // self type, expiration tag shape).
  void event
  return { valid: false, errors: ['not implemented'] }
}
