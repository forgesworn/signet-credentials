# signet-credentials

[![GitHub Sponsors](https://img.shields.io/github/sponsors/TheCryptoDonkey?logo=githubsponsors&color=ea4aaa&label=Sponsor)](https://github.com/sponsors/TheCryptoDonkey)

Consumer SDK for **Signet credentials** on Nostr: build, fetch, parse, and validate the kind-31000 credential profile used by the [Signet](https://github.com/forgesworn/signet) protocol.

> Status: **1.x, `persona-name` profile shipped.** 40 tests passing. Future profiles (`age-scope`, `professional`, `supersession`) planned. See [`docs/ecosystem.md`](https://github.com/forgesworn/signet/blob/main/docs/ecosystem.md) in the parent Signet repo for the wider lib portfolio.

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
import type { PersonaNameScope } from 'signet-credentials'

// 'adult' for an adult user, 'adult+child' for a child user.
const userScope: PersonaNameScope = 'adult'

// personaPrivKey is a hex string (not a Uint8Array).
const event = await buildPersonaNameCredential(personaPrivKey, 'Axolittle', {
  scope: userScope,            // required: 'adult' | 'adult+child', see "Why scope is required"
  expirySeconds: 365 * 86_400, // optional, default 365 days
  supersedesId: prevCredId,    // optional, event id of the credential being replaced
})

// Caller publishes `event` to relays via their existing transport.
// (This function does not publish — it builds and signs.)
```

### Advanced building blocks

`parsePersonaName(event)`: synchronous pure parse, no validation. Returns `PersonaName | null`, with the raw `displayName` even if it exceeds the protocol limit; lets you read crypto-untrusted credentials for diagnostic purposes.

`validatePersonaCredential(event)`: async structural + signature check. Resolves to `{valid, errors[]}`. Use when you want explicit error reporting rather than a fail-closed `null`.

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

### Types and options

`NostrEvent` and `ValidationResult` come from `signet-protocol`; `ValidationResult` is `{ valid: boolean; errors: string[] }`. Only `parsePersonaName` is synchronous.

```typescript
function fetchPersonaHandle(
  pubkey: string,
  opts: FetchPersonaHandleOptions,
): Promise<FetchPersonaHandleResult>

function parseValidPersonaName(
  event: NostrEvent,
  nowUnix?: number,
): Promise<PersonaName | null>

function buildPersonaNameCredential(
  privateKey: string,
  displayName: string,
  opts: BuildPersonaNameCredentialOptions,
): Promise<NostrEvent>

function parsePersonaName(event: NostrEvent): PersonaName | null

function validatePersonaCredential(event: NostrEvent): Promise<ValidationResult>

interface PersonaName {
  pubkey: string              // subject pubkey, hex, 64 chars, lowercase
  displayName: string         // raw `display-name` tag value, may exceed 100 chars
  expiresAt: number | null    // unix seconds; null when there is no `expiration` tag
  supersedes?: string         // id of the credential this one supersedes
  credentialId: string        // event id (hex)
  rawEvent: NostrEvent        // the original signed event
}

type PersonaNameScope = 'adult' | 'adult+child'

interface BuildPersonaNameCredentialOptions {
  scope: PersonaNameScope     // required
  expirySeconds?: number      // seconds from now; default 365 * 24 * 60 * 60
  supersedesId?: string       // id of the persona-name credential being superseded
}

interface FetchPersonaHandleOptions {
  relayUrls: string[]         // required, non-empty
  timeoutMs?: number          // per-relay deadline in ms; default 3000
  verify?: boolean            // verify signature and event id; default true
  webSocketFactory?: (url: string) => WebSocket  // default: globalThis.WebSocket
}
```

- `pubkey` (for `fetchPersonaHandle`) is a 64-character hex string. Upper case is accepted and lowercased before querying. Anything else, or an empty `relayUrls`, returns `{ status: 'invalid-input' }`.
- `privateKey` is a hex string. A `Uint8Array` is not accepted. The credential is self-issued: the pubkey derived from this key is both subject and signer.
- `supersedesId` is the event id (64-character hex, the `credentialId` of the earlier credential). It is written to the `supersedes` tag as given and is not checked.
- `nowUnix` is Unix seconds and defaults to the current time. It is the clock `parseValidPersonaName` compares `expiresAt` against.
- `validatePersonaCredential` reports these `errors` strings: `kind must be 31000`, `missing required display-name tag`, `display-name length exceeds 100 characters`, `display-name must not be whitespace-only` and `invalid signature or event id`.

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
- **`age-scope`**: `scope: 'adult' | 'adult+child'` claims with optional ZKP range proofs (planned)
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

`signet-protocol`'s credential model (`buildCredentialEvent`) demands a `scope` value, typed here as `PersonaNameScope = 'adult' | 'adult+child'`. Pass `'adult'` for an adult user and `'adult+child'` for a child user (the value `signet-protocol` itself assigns to under-18 subjects). For a display-name credential the scope is semantically meaningless (your name is not an age claim) but the field is required. Rather than hardcoding `adult` (which would lie about every child user's name credential), the lib forces the caller to declare. Future protocol work may split "credential with tier/scope" from "attribute publication" and remove this awkwardness.

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
