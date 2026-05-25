import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { buildCredentialEvent, signEvent, getPublicKey } from 'signet-protocol'
import type { NostrEvent } from 'signet-protocol'

export interface TestPersonaCredentialOpts {
  displayName: string
  expiresAt?: number
  supersedesId?: string
  privateKeyHex?: string
  createdAt?: number
}

export interface TestPersonaCredential {
  event: NostrEvent
  privateKeyHex: string
  pubkeyHex: string
  displayName: string
}

/** Generate a fresh schnorr secret key (hex). */
export function generatePrivateKeyHex(): string {
  return bytesToHex(schnorr.utils.randomSecretKey())
}

/**
 * Build + sign a Signet persona-name credential using the real
 * signet-protocol builders. Used by tests as a known-valid input.
 */
export async function makePersonaNameCredential(
  opts: TestPersonaCredentialOpts,
): Promise<TestPersonaCredential> {
  const privateKeyHex = opts.privateKeyHex ?? generatePrivateKeyHex()
  const pubkeyHex = getPublicKey(privateKeyHex)
  const expiresAt = opts.expiresAt ?? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60

  const template = buildCredentialEvent(pubkeyHex, {
    subjectPubkey: pubkeyHex,
    tier: 1,
    type: 'self',
    scope: 'adult',
    method: 'self-declaration',
    expiresAt,
    supersedes: opts.supersedesId,
  })

  const withName = {
    ...template,
    created_at: opts.createdAt ?? template.created_at,
    tags: [...template.tags, ['display-name', opts.displayName]],
  }

  const event = await signEvent(withName, privateKeyHex)
  return { event, privateKeyHex, pubkeyHex, displayName: opts.displayName }
}
