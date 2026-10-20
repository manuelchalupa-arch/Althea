// Tipos para scripts/lib/env-config.mjs (consumido por tests en src/).

export const MODES: string[]
export const FIREBASE_KEYS: string[]
export const VAPID_KEY: string
export const PROXY_KEY: string

export function projectVarForMode(mode: string): string
export function siteVarForMode(mode: string): string
export function envFileForMode(mode: string): string
export function isMode(mode: string): boolean
export function stripQuotes(value: string): string

export function parseEnvFile(content: string): Record<string, string>

export function resolveEnvValue(key: string, layers: Array<Record<string, string> | undefined>): string
export function resolveEnvValues(
  keys: string[],
  layers: Array<Record<string, string> | undefined>,
): Record<string, string>

export function isPlaceholder(value: string | null | undefined): boolean
export function parseHttpsHost(value: string | null | undefined): string | null

export interface BuildEnvValidation {
  ok: boolean
  mode: string
  errors: string[]
  summary: { mode?: string; project?: string; host?: string }
}

export function validateBuildEnv(args: {
  mode: string
  values?: Record<string, string>
  otherProjectId?: string
  otherWorkerName?: string
}): BuildEnvValidation

export interface FirestoreE2eGuard {
  ok: boolean
  level: 'ok' | 'block' | 'abort'
  code: string
  message: string
}

export function checkFirestoreE2eTarget(args: {
  projectId?: string
  apiKey?: string
  stagingId?: string
  productionId?: string
}): FirestoreE2eGuard

export function buildEnvFileContent(args: {
  mode: string
  values?: Record<string, string>
}): string

export function buildFirebasercContent(args: {
  stagingProjectId: string
  productionProjectId: string
  stagingSiteId?: string
  productionSiteId?: string
}): string

export function ensureGitignoreEntry(
  content: string,
  entry: string,
): { content: string; changed: boolean }
