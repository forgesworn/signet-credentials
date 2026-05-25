import { buildCredentialEvent, signEvent, getPublicKey } from 'signet-protocol'
import type { NostrEvent } from 'signet-protocol'
import type { PersonaNameCredentialOptions } from './types.js'

const DEFAULT_EXPIRY_SECONDS = 365 * 24 * 60 * 60

/**
 * Build and sign a Signet persona-name credential (kind 31000).
 *
 * Wraps `buildCredentialEvent` from `signet-protocol` with the Signet-profile
 * `display-name` tag. The credential is emitted as `type: 'self'` with the
 * persona as both subject and signer (self-declaration).
 *
 * Caller is responsible for publishing the returned event to relays.
 *
 * @param privateKey  Persona private key (hex).
 * @param displayName Handle to record. Capped at 100 chars by callers per
 *                    Signet's display-name policy.
 * @param opts        Optional expiry override + supersession reference.
 *
 * @returns Signed kind-31000 event ready to publish.
 */
export async function publishPersonaNameCredential(
  privateKey: string,
  displayName: string,
  opts: PersonaNameCredentialOptions = {},
): Promise<NostrEvent> {
  // TODO(skeleton): port body from signet-app/src/lib/signet.ts
  //   publishPersonaNameCredential. Wraps buildCredentialEvent + appends
  //   ['display-name', displayName] tag before signing.
  void privateKey
  void displayName
  void opts
  void DEFAULT_EXPIRY_SECONDS
  void buildCredentialEvent
  void signEvent
  void getPublicKey
  throw new Error('not implemented')
}
