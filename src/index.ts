/**
 * signet-credentials — Consumer SDK for Signet credential events.
 *
 * Each Signet credential profile lives in its own subdirectory. The top-level
 * barrel re-exports the public surface so consumers can import from the
 * package root, or pick a single subpath import to keep bundles small.
 *
 * Subpath imports:
 *   import { fetchPersonaHandle } from 'signet-credentials/persona-name'
 *
 * Barrel import:
 *   import { fetchPersonaHandle } from 'signet-credentials'
 */

export {
  buildPersonaNameCredential,
  fetchPersonaHandle,
  parsePersonaName,
  parseValidPersonaName,
  validatePersonaCredential,
} from './persona-name/index.js'

export type {
  PersonaName,
  PersonaNameScope,
  BuildPersonaNameCredentialOptions,
  FetchPersonaHandleOptions,
  FetchPersonaHandleResult,
} from './persona-name/index.js'
