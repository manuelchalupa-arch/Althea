// wgerLicense — Licencias y atribución para datos WGER.
// FASE 21: Licencias y atribución.
//
// REGLAS:
// - Conservar metadata de origen de los datos WGER.
// - No copiar ni redistribuir contenido sin verificar la licencia aplicable.
// - Distinguir software WGER (código) vs datos/contenido suministrado por WGER.
// - No asumir que todos los elementos tienen idéntica licencia.

import type { WgerLicense as WgerLicenseRaw, WgerExerciseImage, WgerIngredient } from './wgerTypes'

// ─── Tipos ───

export type WgerLicenseType =
  | 'CC_BY_SA_3'
  | 'CC_BY_SA_4'
  | 'CC0'
  | 'GPL'
  | 'AGPL'
  | 'MIT'
  | 'UNKNOWN'

export interface WgerLicenseInfo {
  type: WgerLicenseType
  name: string
  shortName: string
  url: string
  requiresAttribution: boolean
  allowsRedistribution: boolean
  allowsModification: boolean
  shareAlike: boolean
}

export interface WgerAttribution {
  source: 'wger'
  sourceId: string | number
  sourceUrl: string
  license: WgerLicenseInfo
  author: string
  authorUrl?: string
  originalUrl?: string
  title?: string
  derivativeSourceUrl?: string
}

export interface WgerProvenanceMetadata {
  source: 'wger'
  sourceId: string | number
  sourceUrl: string
  license: WgerLicenseInfo
  attribution: WgerAttribution
  importedAt: string
  lastUpdated: string
}

// ─── Mapeo de licencias conocidas ───

const LICENSE_MAP: Record<string, WgerLicenseInfo> = {
  'CC BY-SA 3.0': {
    type: 'CC_BY_SA_3',
    name: 'Creative Commons Attribution-ShareAlike 3.0',
    shortName: 'CC BY-SA 3.0',
    url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    requiresAttribution: true,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: true,
  },
  'CC BY-SA 4.0': {
    type: 'CC_BY_SA_4',
    name: 'Creative Commons Attribution-ShareAlike 4.0',
    shortName: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    requiresAttribution: true,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: true,
  },
  'CC0': {
    type: 'CC0',
    name: 'Creative Commons Zero v1.0 Universal',
    shortName: 'CC0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiresAttribution: false,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: false,
  },
  'GPL': {
    type: 'GPL',
    name: 'GNU General Public License',
    shortName: 'GPL',
    url: 'https://www.gnu.org/licenses/gpl-3.0.html',
    requiresAttribution: true,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: true,
  },
  'AGPL': {
    type: 'AGPL',
    name: 'GNU Affero General Public License',
    shortName: 'AGPL',
    url: 'https://www.gnu.org/licenses/agpl-3.0.html',
    requiresAttribution: true,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: true,
  },
  'MIT': {
    type: 'MIT',
    name: 'MIT License',
    shortName: 'MIT',
    url: 'https://opensource.org/licenses/MIT',
    requiresAttribution: true,
    allowsRedistribution: true,
    allowsModification: true,
    shareAlike: false,
  },
}

const UNKNOWN_LICENSE: WgerLicenseInfo = {
  type: 'UNKNOWN',
  name: 'Unknown License',
  shortName: 'Unknown',
  url: '',
  requiresAttribution: true,
  allowsRedistribution: false,
  allowsModification: false,
  shareAlike: false,
}

// ─── Funciones de licencia ───

export function resolveWgerLicense(raw: WgerLicenseRaw | null | undefined): WgerLicenseInfo {
  if (!raw) {return UNKNOWN_LICENSE}
  return LICENSE_MAP[raw.full_name] || LICENSE_MAP[raw.short_name] || {
    ...UNKNOWN_LICENSE,
    name: raw.full_name || 'Unknown License',
    shortName: raw.short_name || 'Unknown',
    url: raw.url || '',
  }
}

export function canRedistribute(license: WgerLicenseInfo): boolean {
  return license.allowsRedistribution
}

export function canModify(license: WgerLicenseInfo): boolean {
  return license.allowsModification
}

export function requiresAttribution(license: WgerLicenseInfo): boolean {
  return license.requiresAttribution
}

export function mustShareAlike(license: WgerLicenseInfo): boolean {
  return license.shareAlike
}

// ─── Construcción de atribución ───

export function buildAttribution(params: {
  sourceId: string | number
  sourceUrl: string
  license: WgerLicenseInfo
  author: string
  authorUrl?: string
  originalUrl?: string
  title?: string
  derivativeSourceUrl?: string
}): WgerAttribution {
  return {
    source: 'wger',
    sourceId: params.sourceId,
    sourceUrl: params.sourceUrl,
    license: params.license,
    author: params.author,
    authorUrl: params.authorUrl,
    originalUrl: params.originalUrl,
    title: params.title,
    derivativeSourceUrl: params.derivativeSourceUrl,
  }
}

export function buildProvenanceMetadata(params: {
  sourceId: string | number
  sourceUrl: string
  license: WgerLicenseInfo
  author: string
  authorUrl?: string
  originalUrl?: string
  title?: string
  derivativeSourceUrl?: string
}): WgerProvenanceMetadata {
  return {
    source: 'wger',
    sourceId: params.sourceId,
    sourceUrl: params.sourceUrl,
    license: params.license,
    attribution: buildAttribution(params),
    importedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }
}

// ─── Atribución desde tipos WGER ───

export function attributionFromExerciseImage(image: WgerExerciseImage): WgerAttribution {
  return buildAttribution({
    sourceId: image.id,
    sourceUrl: image.license_object_url || '',
    license: resolveWgerLicense({
      id: image.license,
      full_name: image.license_title,
      short_name: image.license_title,
      url: image.license_object_url,
    }),
    author: image.license_author || 'Unknown',
    authorUrl: image.license_author_url,
    originalUrl: image.license_object_url,
    derivativeSourceUrl: image.license_derivative_source_url,
  })
}

export function attributionFromIngredient(ingredient: WgerIngredient): WgerAttribution {
  return buildAttribution({
    sourceId: ingredient.id,
    sourceUrl: ingredient.license_object_url || ingredient.source_url || '',
    license: resolveWgerLicense({
      id: ingredient.license,
      full_name: ingredient.license_title,
      short_name: ingredient.license_title,
      url: ingredient.license_object_url,
    }),
    author: ingredient.license_author || 'Unknown',
    originalUrl: ingredient.license_object_url,
    title: ingredient.name,
  })
}

// ─── Formato de atribución para UI ───

export function formatAttribution(attribution: WgerAttribution): string {
  const parts: string[] = []

  if (attribution.title) {
    parts.push(`"${attribution.title}"`)
  }

  if (attribution.author && attribution.author !== 'Unknown') {
    parts.push(`por ${attribution.author}`)
  }

  if (attribution.license.shortName !== 'Unknown') {
    parts.push(`(${attribution.license.shortName})`)
  }

  if (attribution.sourceUrl) {
    parts.push(`Fuente: ${attribution.sourceUrl}`)
  }

  return parts.join(' ')
}

// ─── Verificación de redistribución ───

export function verifyRedistributionAllowed(
  license: WgerLicenseInfo,
  context: string,
): { allowed: boolean; reason?: string } {
  if (!license.allowsRedistribution) {
    return {
      allowed: false,
      reason: `Redistribución no permitida para ${context} con licencia ${license.shortName}`,
    }
  }

  if (license.shareAlike) {
    return {
      allowed: true,
      reason: `Obra derivada debe usar la misma licencia (${license.shortName})`,
    }
  }

  return { allowed: true }
}
