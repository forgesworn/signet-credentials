import { describe, test, expect } from 'vitest'
import { verifyEvent, getPublicKey } from 'signet-protocol'
import { publishPersonaNameCredential } from '../../src/persona-name/publish.js'
import { generatePrivateKeyHex } from '../fixtures.js'

function findTag(tags: string[][], name: string): string | null {
  for (const t of tags) if (t[0] === name && typeof t[1] === 'string') return t[1]
  return null
}

describe('publishPersonaNameCredential', () => {
  test('returns a kind-31000 event signed by the persona key', async () => {
    const sk = generatePrivateKeyHex()
    const event = await publishPersonaNameCredential(sk, 'Axolittle')

    expect(event.kind).toBe(31000)
    expect(event.pubkey).toBe(getPublicKey(sk))
    expect(await verifyEvent(event)).toBe(true)
  })

  test('embeds the display-name tag with the provided handle', async () => {
    const event = await publishPersonaNameCredential(generatePrivateKeyHex(), 'Axolittle')
    expect(findTag(event.tags, 'display-name')).toBe('Axolittle')
  })

  test('defaults the expiration tag to 365 days from now (NIP-40)', async () => {
    const before = Math.floor(Date.now() / 1000)
    const event = await publishPersonaNameCredential(generatePrivateKeyHex(), 'Axolittle')
    const after = Math.floor(Date.now() / 1000)

    const expirationStr = findTag(event.tags, 'expiration')
    expect(expirationStr).not.toBeNull()
    const expiresAt = parseInt(expirationStr!, 10)
    const year = 365 * 24 * 60 * 60
    expect(expiresAt).toBeGreaterThanOrEqual(before + year)
    expect(expiresAt).toBeLessThanOrEqual(after + year)
  })

  test('honours the expirySeconds option', async () => {
    const before = Math.floor(Date.now() / 1000)
    const event = await publishPersonaNameCredential(
      generatePrivateKeyHex(),
      'Axolittle',
      { expirySeconds: 60 },
    )
    const after = Math.floor(Date.now() / 1000)
    const expiresAt = parseInt(findTag(event.tags, 'expiration')!, 10)
    expect(expiresAt).toBeGreaterThanOrEqual(before + 60)
    expect(expiresAt).toBeLessThanOrEqual(after + 60)
  })

  test('adds the supersedes tag when supersedesId is provided', async () => {
    const prevId = 'a'.repeat(64)
    const event = await publishPersonaNameCredential(
      generatePrivateKeyHex(),
      'Axolittle',
      { supersedesId: prevId },
    )
    expect(findTag(event.tags, 'supersedes')).toBe(prevId)
  })

  test('omits the supersedes tag when no supersedesId is provided', async () => {
    const event = await publishPersonaNameCredential(generatePrivateKeyHex(), 'Axolittle')
    expect(findTag(event.tags, 'supersedes')).toBeNull()
  })

  test('emits "expiration", never the deprecated "expires" tag', async () => {
    const event = await publishPersonaNameCredential(generatePrivateKeyHex(), 'Axolittle')
    expect(event.tags.some((t) => t[0] === 'expires')).toBe(false)
    expect(event.tags.some((t) => t[0] === 'expiration')).toBe(true)
  })
})
