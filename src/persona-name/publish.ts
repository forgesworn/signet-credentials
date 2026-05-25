import { buildCredentialEvent, signEvent, getPublicKey } from 'signet-protocol'
import type { NostrEvent } from 'signet-protocol'
import type { BuildPersonaNameCredentialOptions } from './types.js'

const DEFAULT_EXPIRY_SECONDS = 365 * 24 * 60 * 60

/**
 * Build and sign a Signet persona-name credential (kind 31000).
 *
 * Wraps `buildCredentialEvent` from `signet-protocol` with the Signet-profile
 * `display-name` tag. The credential is emitted as `type: 'self'` with the
 * persona as both subject and signer (self-declaration). `expiration` is set
 * per NIP-40. `supersedes` is added when an earlier credential id is provided.
 *
 * This function does NOT publish the event — the caller is responsible for
 * pushing the returned signed event to one or more relays via their own
 * transport.
 *
 * `scope` is required because `signet-protocol`'s credential model demands it
 * (`adult` or `adult+child`). For a display-name credential the scope is
 * semantically meaningless, but we surface the choice rather than hardcoding
 * a value that misrepresents the caller's intent.
 */
export async function buildPersonaNameCredential(
  privateKey: string,
  displayName: string,
  opts: BuildPersonaNameCredentialOptions,
): Promise<NostrEvent> {
  const pubkey = getPublicKey(privateKey)
  const expirySeconds = opts.expirySeconds ?? DEFAULT_EXPIRY_SECONDS
  const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds

  const template = buildCredentialEvent(pubkey, {
    subjectPubkey: pubkey,
    tier: 1,
    type: 'self',
    scope: opts.scope,
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
