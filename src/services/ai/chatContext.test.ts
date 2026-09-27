import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { buildChatContext } from './chatContext'

describe('chatContext — contexto real y personalidad del Coach', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('incluye datos reales del perfil', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', age: 30, weightKg: 80, heightCm: 180,
      goalPrimary: 'hipertrofia', experienceLevel: 'intermediate',
    } as never)
    const ctx = await buildChatContext('Coach IA')
    expect(ctx).toContain('Nico')
    expect(ctx.toLowerCase()).toContain('hipertrofia')
    expect(ctx).toContain('intermediate')
  })

  it('método + tono oficiales llegan al contexto de la conversación', async () => {
    await db.userProfile.put({ id: 'me', coachMethodView: 'power', coachTone: 'ARNOLD' } as never)
    const ctx = await buildChatContext('Coach IA')
    expect(ctx).toContain('Potencia')
    expect(ctx).toContain('tono ARNOLD')
  })

  it('tono legacy se migra al perfil oficial', async () => {
    await db.userProfile.put({ id: 'me', coachMethodView: 'hypertrophy', coachTone: 'MOTIVACIONAL' } as never)
    const ctx = await buildChatContext('Coach IA')
    expect(ctx).toContain('Hipertrofia')
    expect(ctx).toContain('tono PADELERO')
  })

  it('sin método seleccionado no falla y no inventa estilo', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Ana' } as never)
    const ctx = await buildChatContext('Coach IA')
    expect(ctx).toContain('Ana')
    expect(ctx).not.toContain('Coach activo')
  })

  it('sin perfil devuelve string sin romper el chat', async () => {
    const ctx = await buildChatContext('Coach IA')
    expect(typeof ctx).toBe('string')
    expect(ctx).not.toContain('undefined')
  })
})