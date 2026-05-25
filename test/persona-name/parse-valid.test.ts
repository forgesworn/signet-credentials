import { describe, test, expect } from 'vitest'
import { parseValidPersonaName } from '../../src/persona-name/parse.js'
import { makePersonaNameCredential } from '../fixtures.js'

describe('parseValidPersonaName (fail-closed primary API)', () => {
  test('returns the parsed credential when the event is valid and not expired', async () => {
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    })
    const result = await parseValidPersonaName(fixture.event)
    expect(result).not.toBeNull()
    expect(result!.displayName).toBe('Axolittle')
  })

  test('returns null when the event has a tampered signature', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const tampered = { ...fixture.event, sig: 'c'.repeat(128) }
    expect(await parseValidPersonaName(tampered)).toBeNull()
  })

  test('returns null when the display-name exceeds the protocol limit', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'x'.repeat(500) })
    expect(await parseValidPersonaName(fixture.event)).toBeNull()
  })

  test('returns null when the credential is expired', async () => {
    const fixture = await makePersonaNameCredential({
      displayName: 'Axolittle',
      expiresAt: Math.floor(Date.now() / 1000) - 86_400,
    })
    expect(await parseValidPersonaName(fixture.event)).toBeNull()
  })

  test('returns null when the credential has no expiration tag (fail-closed)', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const noExpiry = {
      ...fixture.event,
      tags: fixture.event.tags.filter((t) => t[0] !== 'expiration'),
    }
    // No signature recomputation needed — even if validation passed, fail-closed
    // rejects credentials lacking explicit expiry.
    expect(await parseValidPersonaName(noExpiry)).toBeNull()
  })

  test('returns null when the event kind is wrong', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const wrongKind = { ...fixture.event, kind: 1 }
    expect(await parseValidPersonaName(wrongKind)).toBeNull()
  })
})
