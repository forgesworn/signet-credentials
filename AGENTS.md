# signet-credentials

Consumer SDK for Signet credential events on Nostr: publish, fetch, parse and
validate the kind-31000 credential profile used by the
[Signet](https://github.com/forgesworn/signet) protocol. `signet-protocol` is
a peer dependency and provides the core types and crypto layer. Only the
`persona-name` profile is shipped; other profiles are planned but not
implemented.

## Build & Test

| Command | Purpose |
|---------|---------|
| `npm ci` | Install dependencies |
| `npm run build` | Compile with `tsc` |
| `npm test` | Run the test suite (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint `src/` with eslint |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run typecheck` | Type-check without emitting |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, build, then
`npx vitest run --coverage` on Node 24.

## Structure

```
src/
  index.ts               barrel: re-exports the persona-name profile
  persona-name/
    index.ts              profile barrel
    fetch.ts               fetchPersonaHandle
    parse.ts                parsePersonaName, parseValidPersonaName
    publish.ts               buildPersonaNameCredential
    validate.ts               validatePersonaCredential
    types.ts                   PersonaName and related types
test/
  fixtures.ts             shared test fixtures
  persona-name/           tests mirroring src/persona-name/
```

## Conventions

- British English in prose and comments.
- Each credential profile lives in its own `src/<profile>/` directory with
  its own subpath export (e.g. `signet-credentials/persona-name`); the root
  barrel re-exports every shipped profile.
- Result types are discriminated unions (e.g. `FetchPersonaHandleResult`) so
  callers must switch on `status` rather than guessing from a falsy value.
- No default relay: functions that talk to relays take `relayUrls` from the
  caller.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Public package entry point (`main`/`exports["."]`) |
| `src/persona-name/index.ts` | `persona-name` subpath entry point |
| `package.json` | `exports` map: `.` and `./persona-name` |

## Common Pitfalls

- Do not read an `['expires', ...]` tag: the protocol uses NIP-40's
  `['expiration', '<unix>']`. Reading the wrong tag name silently treats
  expired credentials as valid.
- `fetchPersonaHandle`'s `timeout` and `transport-error` statuses mean the
  relay was unreachable, not that no credential exists; do not fold them into
  a generic "not found" state.
- `parsePersonaName` performs no validation; use `parseValidPersonaName` or
  `validatePersonaCredential` when the input is untrusted.
- `scope` is required by `signet-protocol`'s credential model even though it
  is semantically meaningless for a display-name credential; do not default
  it to `'adult'`.
