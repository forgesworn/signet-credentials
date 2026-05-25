# signet-credentials

[![GitHub Sponsors](https://img.shields.io/github/sponsors/TheCryptoDonkey?logo=githubsponsors&color=ea4aaa&label=Sponsor)](https://github.com/sponsors/TheCryptoDonkey)

Consumer SDK for **Signet credentials** on Nostr — publish, fetch, parse, and validate the kind-31000 credential profile used by the [Signet](https://github.com/forgesworn/signet) protocol.

> Status: **0.x — `persona-name` profile shipped.** API may shift before 1.0. 40 tests passing. Future profiles (`age-scope`, `professional`, `supersession`) planned. See [`docs/ecosystem.md`](https://github.com/forgesworn/signet/blob/main/docs/ecosystem.md) in the parent Signet repo for the wider lib portfolio.

## Why a separate lib?

[`signet-protocol`](https://www.npmjs.com/package/signet-protocol) is the core types + crypto layer. [`signet-login`](https://www.npmjs.com/package/signet-login) is the sign-in SDK. **`signet-credentials`** is the consumer SDK for everything between — fetching a player's handle, building a new persona-name credential, validating an inbound credential before trusting its tag content.

Without this lib, every consumer rolls the same code: a WebSocket relay subscription, a Schnorr signature check, an `expiration`-tag read, a newest-wins dedup. That duplication is a real bug surface (one observed live: reading the wrong tag name silently treats expired credentials as valid). One lib, one source of truth.

## Install

```bash
npm install signet-credentials signet-protocol
```

`signet-protocol` is a peer dependency — the consumer picks the version.

## Quick start

### Fetch a user's display name (primary consumer flow)

```typescript
import { fetchPersonaHandle } from 'signet-credentials'

const result = await fetchPersonaHandle('<pubkey-hex>', {
  relayUrls: ['wss://relay.example.com', 'wss://relay.other.com'],
})

switch (result.status) {
  case 'ok':
    showHandle(result.credential.displayName)
    break
  case 'not-found':
    showFallback()  // user genuinely has no credential
    break
  case 'all-expired':
    showStaleNotice()
    break
  case 'timeout':
  case 'transport-error':
    showRetryUI()  // relay unreachable — DON'T render "no name set"
    break
  case 'invalid-input':
  case 'all-invalid':
    showError()
    break
}
```

Distinguishing these states matters: "no name set" rendered when the relay was actually down is fail-open. The lib makes you switch on `status` so this can't happen by accident.

### Validate an inbound credential in one call

For single-event use (e.g. an inbound multiplayer JoinRequest passthrough), use the fail-closed `parseValidPersonaName`:

```typescript
import { parseValidPersonaName } from 'signet-credentials'

const credential = await parseValidPersonaName(incomingEvent)
if (credential) {
  // event is well-formed, signature valid, length OK, has explicit expiration
  // tag, and is not expired. Trust the displayName.
  acceptHandle(credential.displayName)
} else {
  rejectAuth('invalid or expired display-name credential')
}
```

### Build + sign a new credential

```typescript
import { buildPersonaNameCredential } from 'signet-credentials'

const event = await buildPersonaNameCredential(personaPrivKey, 'Axolittle', {
  scope: 'adult',              // required — see "scope" note below
  expirySeconds: 365 * 86_400, // optional, default 365 days
  supersedesId: prevCredId,    // optional
})

// Caller publishes `event` to relays via their existing transport.
// (This function does not publish — it builds and signs.)
```

### Advanced building blocks

`parsePersonaName(event)` — pure parse, no validation. Returns the raw `displayName` even if it exceeds the protocol limit; lets you read crypto-untrusted credentials for diagnostic purposes.

`validatePersonaCredential(event)` — structural + signature check. Returns `{valid, errors[]}`. Use when you want explicit error reporting rather than a fail-closed boolean.

## API

### `persona-name` profile

Subpath import: `signet-credentials/persona-name`. The barrel re-exports everything from this profile at the package root.

| Function | Purpose |
|---|---|
| `fetchPersonaHandle(pubkey, opts)` | Query N relays in parallel; return discriminated `FetchPersonaHandleResult` |
| `parseValidPersonaName(event)` | **Primary fail-closed.** Parse + validate + non-expired check in one |
| `buildPersonaNameCredential(privateKey, displayName, opts)` | Build + sign (does not publish) |
| `parsePersonaName(event)` | Pure parse (no validation) — advanced |
| `validatePersonaCredential(event)` | Structural + Schnorr check — advanced |

### `FetchPersonaHandleResult` (discriminated)

```typescript
type FetchPersonaHandleResult =
  | { status: 'ok'; credential: PersonaName }
  | { status: 'not-found' }
  | { status: 'all-expired' }
  | { status: 'all-invalid' }
  | { status: 'timeout' }
  | { status: 'invalid-input' }
  | { status: 'transport-error'; error: unknown }
```

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

### No default relay

`fetchPersonaHandle` requires `relayUrls: string[]` with no default. This lib is profile-agnostic — it shouldn't bake in any one operator's relay. Pick your own, or read NIP-65 outbox relays via your preferred resolver.

### Multi-relay semantics

All relays are queried in parallel. When at least one relay returns a valid non-expired credential, the result is `ok` with the newest across all relays (by `created_at`). When no relay returns a valid credential, the aggregate status picks the most-informative single-relay state (`all-expired` > `all-invalid` > `not-found` > transport failure).

**Limitation:** ordering is a `created_at` heuristic, not a supersession-chain walk. A future minor will add chain-aware selection.

### Why `scope` is required

`signet-protocol`'s credential model (`buildCredentialEvent`) demands a `scope` value (`adult` or `adult+child`). For a display-name credential the scope is semantically meaningless — your name is not an age claim — but the field is required. Rather than hardcoding `adult` (which would lie about every child user's name credential), the lib forces the caller to declare. Future protocol work may split "credential with tier/scope" from "attribute publication" and remove this awkwardness.

### Bring-your-own transport

`webSocketFactory` is an advanced option. The default uses `globalThis.WebSocket`, which works in the browser and in Node 22+. Override only for older Node or for test injection.

### Bring-your-own signer (for now)

`buildPersonaNameCredential` takes a raw hex private key. A future minor will accept any `SigningBackend` (signet-protocol's NIP-46 / WebAuthn / local interface) so the lib composes cleanly with bunker-mode flows.

### Tag name compliance

The Signet credential profile uses `['expiration', '<unix>']` per [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md). Hand-rolled consumers historically read `['expires', '<unix>']`, which silently treats credentials as never-expiring. This lib gets it right.

### Display-name normalisation policy

The lib **rejects** display names that are whitespace-only (length > 0 but empty after trim) or that exceed 100 characters. It does NOT normalise Unicode form (NFC) or strip control characters from accepted names — that's the consumer's job at the display layer. The raw value is preserved on the parsed credential so consumers can apply their own policy.

## Known gaps (documented; PRs welcome)

- **Supersession-chain walking** — current ordering is `created_at`-only.
- **NIP-65 outbox model** — `relayUrls` is caller-supplied; no automatic outbox resolution.
- **`AbortSignal` support** — `fetchPersonaHandle` cannot be cancelled mid-flight.
- **`SigningBackend` for build/sign** — currently raw hex key only.
- **Duplicate `display-name` tag handling** — first wins. Document or reject.

## Contributing

The `persona-name` profile is the first shipped. Pull requests welcome for the remaining profiles (`age-scope`, `professional`, `supersession`) and for the gaps listed above.

## Licence

MIT — see [LICENSE](./LICENSE).
