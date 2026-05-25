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
  publishPersonaNameCredential,
  fetchPersonaHandle,
  parsePersonaName,
  validatePersonaCredential,
} from './persona-name/index.js'

export type {
  PersonaName,
  PersonaNameCredentialOptions,
  FetchPersonaHandleOptions,
  PersonaHandleResult,
} from './persona-name/index.js'
