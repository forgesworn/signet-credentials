# signet-credentials

[![GitHub Sponsors](https://img.shields.io/github/sponsors/TheCryptoDonkey?logo=githubsponsors&color=ea4aaa&label=Sponsor)](https://github.com/sponsors/TheCryptoDonkey)

Consumer SDK for **Signet credentials** on Nostr — publish, fetch, parse, and validate the kind-31000 credential profile used by the [Signet](https://github.com/forgesworn/signet) protocol.

> Status: **0.1.0 skeleton.** API surface scaffolded, bodies pending. Filed against [Signet ecosystem plan](https://github.com/forgesworn/signet/blob/main/docs/ecosystem.md).

## Why a separate lib?

[`signet-protocol`](https://www.npmjs.com/package/signet-protocol) is the core types + crypto layer. [`signet-login`](https://www.npmjs.com/package/signet-login) is the sign-in SDK. **`signet-credentials`** is the consumer SDK for everything between — fetching a player's handle, publishing a new persona-name credential, validating an inbound credential before trusting its tag content.

Until now consumers (axenstax, dossier, coach-pulse-web) hand-rolled this against raw `nostr-tools`. That meant duplicated relay-fetch code, duplicated Schnorr verify, and at least one [silent fail-open bug](https://github.com/forgesworn/signet/blob/main/docs/ecosystem.md#audit-finding) (reading the wrong tag name for expiry). One lib, one source of truth.

## Install

```bash
npm install signet-credentials signet-protocol
```

`signet-protocol` is a peer dependency — the consumer picks the version.

## Quick start

Fetch the current display name for a Signet pubkey:

```typescript
import { fetchPersonaHandle } from 'signet-credentials'

const result = await fetchPersonaHandle('<pubkey-hex>', {
  relayUrl: 'wss://relay.trotters.cc',
})

if (result) {
  console.log(result.displayName)   // → "Axolittle"
  console.log(result.expiresAt)     // → 1812345678 (unix seconds)
  console.log(result.credentialId)  // → event id (for supersession refs)
}
```

Publish a new display name (after Signet-app sign-in flow):

```typescript
import { publishPersonaNameCredential } from 'signet-credentials'

const event = await publishPersonaNameCredential(personaPrivKey, 'Axolittle', {
  expirySeconds: 365 * 24 * 60 * 60,
  supersedesId: previousCredentialEventId,  // optional
})

// Caller publishes `event` to relays via their existing transport.
```

Parse + validate without a relay round-trip (e.g. inbound JoinRequest):

```typescript
import { parsePersonaName, validatePersonaCredential } from 'signet-credentials'

const validation = validatePersonaCredential(incomingEvent)
if (!validation.valid) {
  reject(validation.errors.join(', '))
}

const parsed = parsePersonaName(incomingEvent)
if (parsed && (parsed.expiresAt == null || parsed.expiresAt > nowUnix())) {
  acceptHandle(parsed.displayName)
}
```

## API

### `persona-name` profile

Subpath import: `signet-credentials/persona-name`. The barrel re-exports everything from this profile at the package root.

| Function | Purpose |
|---|---|
| `publishPersonaNameCredential(privateKey, displayName, opts?)` | Build + sign a self-declared persona-name credential |
| `fetchPersonaHandle(pubkey, opts?)` | Subscribe to a relay, return the newest valid credential |
| `parsePersonaName(event)` | Pure parse → `{displayName, expiresAt, supersedes?, ...}` or `null` |
| `validatePersonaCredential(event)` | Structural + Schnorr signature check |

### Planned profiles

The package is scoped to **the Signet credential profile** — `kind: 31000`, `type: 'self' | 'peer' | 'professional'`, with Signet-specific tags. Each profile lives in its own subdirectory and subpath export:

- **`persona-name`** — display-name credentials ✅ (this release)
- **`age-scope`** — `scope: 'adult' | 'child'` claims with optional ZKP range proofs (planned)
- **`professional`** — verifier-issued professional tier credentials (planned)
- **`supersession`** — utilities for tracking + pruning superseded credentials (planned)

Adjacent libs (separate scopes, by design):

- **WoT vouches** — `signet-wot` (planned). Kind 31000 `type: 'vouch'` is a different protocol, not a credential.
- **Identity bridges** — `signet-bridge` (planned). Uses ring signatures from `nostr-veil`.
- **Charter (parent-led grants)** — [`charter`](https://github.com/forgesworn/charter)
- **NIP-VA reference impl** — [`nostr-attestations`](https://www.npmjs.com/package/nostr-attestations)
- **Deterministic identity tree** — [`nsec-tree`](https://www.npmjs.com/package/nsec-tree)
- **Blinded reputation** — [`nostr-veil`](https://www.npmjs.com/package/nostr-veil)

## Design notes

### Bring-your-own transport

`fetchPersonaHandle` accepts a `webSocketFactory` option so this lib works the same in Node (`ws` package), browser (global `WebSocket`), and embedded environments. No transport dependency baked in.

### Bring-your-own signer

`publishPersonaNameCredential` takes a raw hex private key for the v1 surface. A future minor will add an optional `signer` parameter accepting any `SigningBackend` (`signet-protocol`'s NIP-46 / WebAuthn / local interface) so the lib composes cleanly with bunker-mode flows.

### Tag name compliance

The Signet credential profile uses `['expiration', '<unix>']` per [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md). Hand-rolled consumers historically read `['expires', '<unix>']`, which silently treats credentials as never-expiring. This lib gets it right.

## Contributing

The skeleton is in place; implementation bodies are marked `TODO(skeleton)`. Pull requests welcome. See [`docs/ecosystem.md`](https://github.com/forgesworn/signet/blob/main/docs/ecosystem.md) in the parent Signet repo for where this lib fits in the broader portfolio.

## Licence

MIT — see [LICENSE](./LICENSE).
