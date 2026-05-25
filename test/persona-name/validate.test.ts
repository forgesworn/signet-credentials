import { describe, test, expect } from 'vitest'
import { validatePersonaCredential } from '../../src/persona-name/validate.js'
import { makePersonaNameCredential } from '../fixtures.js'

describe('validatePersonaCredential', () => {
  test('accepts a real signed persona-name credential', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const result = await validatePersonaCredential(fixture.event)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test('rejects the wrong event kind', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const wrongKind = { ...fixture.event, kind: 1 }
    const result = await validatePersonaCredential(wrongKind)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /kind/i.test(e))).toBe(true)
  })

  test('rejects a missing display-name tag', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const stripped = {
      ...fixture.event,
      tags: fixture.event.tags.filter((t) => t[0] !== 'display-name'),
    }
    const result = await validatePersonaCredential(stripped)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /display-name/i.test(e))).toBe(true)
  })

  test('rejects a tampered event id', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const tampered = { ...fixture.event, id: 'b'.repeat(64) }
    const result = await validatePersonaCredential(tampered)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /id|signature/i.test(e))).toBe(true)
  })

  test('rejects a tampered signature', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    const tampered = { ...fixture.event, sig: 'c'.repeat(128) }
    const result = await validatePersonaCredential(tampered)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /signature/i.test(e))).toBe(true)
  })

  test('rejects content mutation (signature no longer covers the event id)', async () => {
    const fixture = await makePersonaNameCredential({ displayName: 'Axolittle' })
    // Mutating content invalidates the canonical id without us updating it,
    // so the recomputed id won't match.
    const tampered = { ...fixture.event, content: 'evil' }
    const result = await validatePersonaCredential(tampered)
    expect(result.valid).toBe(false)
  })
})
