import { buildCredentialEvent, signEvent, getPublicKey } from 'signet-protocol'
import type { NostrEvent } from 'signet-protocol'
import type { PersonaNameCredentialOptions } from './types.js'

const DEFAULT_EXPIRY_SECONDS = 365 * 24 * 60 * 60

/**
 * Build and sign a Signet persona-name credential (kind 31000).
 *
 * Wraps `buildCredentialEvent` from `signet-protocol` with the Signet-profile
 * `display-name` tag. The credential is emitted as `type: 'self'` with the
 * persona as both subject and signer (self-declaration), `expiration` set
 * per NIP-40, and `supersedes` when an earlier credential id is provided.
 *
 * Caller is responsible for publishing the returned event to relays.
 */
export async function publishPersonaNameCredential(
  privateKey: string,
  displayName: string,
  opts: PersonaNameCredentialOptions = {},
): Promise<NostrEvent> {
  const pubkey = getPublicKey(privateKey)
  const expirySeconds = opts.expirySeconds ?? DEFAULT_EXPIRY_SECONDS
  const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds

  const template = buildCredentialEvent(pubkey, {
    subjectPubkey: pubkey,
    tier: 1,
    type: 'self',
    scope: 'adult',
    method: 'self-declaration',
    expiresAt,
    supersedes: opts.supersedesId,
  })

  const withName = {
    ...template,
    tags: [...template.tags, ['display-name', displayName]],
  }

  return signEvent(withName, privateKey)
}
