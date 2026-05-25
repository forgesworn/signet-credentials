import { describe, test, expect } from 'vitest'
import { parsePersonaName } from '../../src/persona-name/parse.js'
import { makePersonaNameCredential } from '../fixtures.js'

describe('parsePersonaName', () => {
  test('extracts handle, pubkey, expiresAt, and credentialId from a valid event', async () => {
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      expiresAt: 1_900_000_000,
    })

    const parsed = parsePersonaName(fixture.event)

    expect(parsed).not.toBeNull()
    expect(parsed!.displayName).toBe('Axolittle')
    expect(parsed!.pubkey).toBe(fixture.pubkeyHex)
    expect(parsed!.credentialId).toBe(fixture.event.id)
    expect(parsed!.expiresAt).toBe(1_900_000_000)
    expect(parsed!.rawEvent).toBe(fixture.event)
  })

  test('returns null for the wrong event kind', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const wrongKind = { ...fixture.event, kind: 1 }
    expect(parsePersonaName(wrongKind)).toBeNull()
  })

  test('returns null when the display-name tag is missing', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const stripped = {
      ...fixture.event,
      tags: fixture.event.tags.filter((t) => t[0] !== 'display-name'),
    }
    expect(parsePersonaName(stripped)).toBeNull()
  })

  test('reads expiration (NIP-40), never the deprecated "expires" tag', async () => {
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      expiresAt: 1_900_000_000,
    })
    // Synthesise the historical fail-open shape: drop expiration, add expires.
    const legacyShape = {
      ...fixture.event,
      tags: fixture.event.tags
        .filter((t) => t[0] !== 'expiration')
        .concat([['expires', '1_800_000_000']]),
    }
    expect(parsePersonaName(legacyShape)!.expiresAt).toBeNull()
  })

  test('extracts supersedes when present', async () => {
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      supersedesId: 'a'.repeat(64),
    })
    expect(parsePersonaName(fixture.event)!.supersedes).toBe('a'.repeat(64))
  })

  test('clamps the handle to 100 characters defensively', async () => {
    const huge = 'x'.repeat(500)
    const fixture = await makePersonaNameCredential({ displayName: huge })
    const parsed = parsePersonaName(fixture.event)
    expect(parsed!.displayName).toHaveLength(100)
    expect(parsed!.displayName).toBe('x'.repeat(100))
  })

  test('returns null expiresAt when there is no expiration tag', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const noExpiry = {
      ...fixture.event,
      tags: fixture.event.tags.filter((t) => t[0] !== 'expiration'),
    }
    expect(parsePersonaName(noExpiry)!.expiresAt).toBeNull()
  })
})
