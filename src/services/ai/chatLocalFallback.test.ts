import { describe, it, expect, beforeEach } from 'vitest'
import { todayKey, addDaysToKey } from '@/utils/dates'
import { db } from '@/services/storage/db'
import { buildLocalCoachReply, detectIntent } from './chatLocalFallback'

/** El Coach local responde SIEMPRE con datos reales y nunca con 'undefined'. */
const noUndefined = (t: string) => expect(t).not.toContain('undefined')
const noNull = (t: string) => expect(t).not.toContain('null')

describe('chatLocalFallback — fallback local determinista del Coach', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('detecta la intención según palabras clave', () => {
    expect(detectIntent('¿Qué como hoy para comer?')).toBe('nutrition')
    expect(detectIntent('Me duele la rodilla y no duermo bien')).toBe('recovery')
    expect(detectIntent('¿cuántas series y pesas para hoy?')).toBe('training')
    expect(detectIntent('¿cuánta agua me falta y por qué no bebo?')).toBe('hydration')
    expect(detectIntent('hola')).toBe('general')
  })

  it('sin datos devuelve respuesta honesta en modo local, sin errores técnicos', async () => {
    const reply = await buildLocalCoachReply('qué hago hoy')
    expect(reply.source).toBe('local')
    expect(reply.text).toContain('modo local')
    expect(reply.text).not.toContain('undefined')
    expect(reply.text).not.toContain('null')
    expect(reply.text).not.toContain('Groq')
    expect(reply.text).not.toContain('VITE_')
    expect(reply.text).not.toContain('API')
  })

  it('recuperación registrada se refleja en la respuesta local', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', goal: 'hipertrofia', level: 'intermedio',
    } as never)
    const today = todayKey()
    await db.recoveryChecks.put({
      id: today, localDate: today, energy: 4, fatigue: 8, stress: 6,
      motivation: 5, score: 38, color: 'red', sleepHours: 5.5, sleepQuality: 4,
    } as never)
    const reply = await buildLocalCoachReply('¿cómo está mi recuperación?')
    expect(reply.text).toContain('Recuperación')
    expect(reply.text).toContain('38/100')
    expect(reply.text).not.toContain('undefined')
  })

  it('con historial real genera recomendación de carga con nombre del ejercicio', async () => {
    await db.exercises.put({
      id: 'ex-006', name: 'Sentadilla', groupMain: 'cuadriceps', groupsSecondary: ['gluteos'],
      equipment: 'barra', level: 'intermedio', pattern: 'squat', description: '',
      instructions: [], variantIds: [], muscles: ['cuádriceps', 'glúteo'], restrictions: [], tags: [],
    } as never)
    for (let i = 0; i < 5; i++) {
      const date = `2026-09-${String(2 + i * 3).padStart(2, '0')}`
      await db.setRecords.put({
        setRecordId: `s${i}:set:1`, sessionId: `s${i}`, sessionExerciseId: `se${i}`,
        exerciseId: 'ex-006', order: 1, setType: 'NORMAL',
        plannedReps: 8, plannedWeight: 70 + i * 2, actualReps: 8, actualWeight: 70 + i * 2,
        status: 'COMPLETED', completedAt: `${date}T10:00:00Z`,
        createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z`,
      } as never)
    }
    const reply = await buildLocalCoachReply('¿qué carga uso?')
    expect(reply.text).toContain('Sentadilla')
    expect(reply.text).toContain('Recomendación')
    expect(reply.text).toContain('80.5 kg')
    expect(reply.text).not.toContain('undefined')
  })

  it('respeta las restricciones ALIMENTARIAS del perfil en respuesta de nutrición', async () => {
    // FASE 2 S4: la fuente canónica es nutritionPrefs.restrictions. Antes este
    // test escribía la dietary en profile.restrictions (campo de ENTRENAMIENTO)
    // y por eso el bug estaba cubierto por un test.
    await db.userProfile.put({
      id: 'me', displayName: 'Ana', goal: 'hipertrofia', level: 'intermedio',
      nutritionPrefs: { restrictions: ['vegano'] },
    } as never)
    const reply = await buildLocalCoachReply('qué me recomiendas comer')
    expect(reply.text).toContain('Restricciones: vegano')
    expect(reply.text).not.toContain('undefined')
  })

  it('S4: una restricción de ENTRENAMIENTO no aparece como restricción nutricional', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Ana', goal: 'hipertrofia', level: 'intermedio',
      limitations: ['equipamiento'], restrictions: ['equipamiento'],
      nutritionPrefs: { restrictions: [] },
    } as never)
    const reply = await buildLocalCoachReply('qué me recomiendas comer')
    expect(reply.text).not.toContain('Restricciones:')
    expect(reply.text).not.toContain('equipamiento')
    noUndefined(reply.text)
  })

  it('hidratación: responde con ml real de la botella, sin datos inventados', async () => {
    const today = todayKey()
    await db.hydrationBottleLogs.add({
      id: 'hl-1', localDate: today, bottleId: 'manual', amountMl: 600,
      isDemo: false, createdAt: `${today}T08:00:00Z`, updatedAt: `${today}T08:00:00Z`,
    } as never)
    const reply = await buildLocalCoachReply('¿cuánta agua me falta?')
    expect(reply.source).toBe('local')
    expect(reply.text).toContain('600 ml')
    expect(reply.text).toContain('Hidratación de hoy:')
    expect(reply.text).not.toContain('undefined')
    expect(reply.text).toContain('modo local')
  })

  it('general incluye peso, hidratación, sesión de hoy y adherencia reales', async () => {
    const today = todayKey()
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', goal: 'hipertrofia', level: 'intermedio', weightKg: 80,
    } as never)
    await db.bodyMeasurements.add({ id: today, localDate: today, weightKg: 80, bodyFatPct: 20, waistCm: 90, createdAt: new Date().toISOString() } as never)
    await db.recoveryChecks.add({ id: today, localDate: today, energy: 5, fatigue: 6, stress: 5, motivation: 7, score: 72, color: 'green', sleepHours: 7, sleepQuality: 5 } as never)
    await db.setRecords.add({
      setRecordId: 'r1', sessionId: 's1', sessionExerciseId: 'se1', exerciseId: 'ex-006',
      order: 1, setType: 'NORMAL', plannedReps: 8, plannedWeight: 80, actualReps: 8,
      actualWeight: 80, status: 'COMPLETED', completedAt: `${today}T10:00:00Z`,
      createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
    } as never)
    const reply = await buildLocalCoachReply('¿cómo voy?')
    expect(reply.text).toContain('Peso:')
    expect(reply.text).toContain('Adherencia:')
    expect(reply.text).toContain('Sesión de hoy:')
    expect(reply.text).toContain('Recuperación')
    noUndefined(reply.text)
    noNull(reply.text)
  })
})
