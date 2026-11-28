import { useCallback, useEffect, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaInput, AltheaSelect, AltheaTextarea } from '@/components/althea/AltheaInput'
import { currentUser } from '@/services/firebase/auth'
import {
  copyWeekToDraft,
  getPublishedWeek,
  getWeekDraft,
  publishWeekDraft,
  saveWeekDraft,
} from '@/services/crossfit/groups/programmingService'
import { addDaysToLocalDate, getLocalWeekStart, weekDays } from '@/services/crossfit/groups/programmingDates'
import { createGroupWodSnapshot } from '@/services/crossfit/groups/programmingWod'
import { getWod, listWods } from '@/services/crossfit/cfStore'
import type { CfBlockType, CfWod } from '@/services/crossfit/types'
import type {
  CfGroupDayKind,
  CfGroupProgramBlock,
  CfGroupProgramDay,
  CfGroupWeekDraft,
} from '@/services/crossfit/groups/programmingTypes'

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const BLOCK_TYPES: { value: CfBlockType; label: string }[] = [
  { value: 'warmup', label: 'Entrada en calor' },
  { value: 'mobility', label: 'Movilidad' },
  { value: 'skill', label: 'Técnica' },
  { value: 'strength', label: 'Fuerza' },
  { value: 'wod', label: 'WOD' },
  { value: 'cooldown', label: 'Vuelta a la calma' },
]

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyWeek(groupId: string, ownerId: string, weekStart: string): CfGroupWeekDraft {
  return {
    groupId,
    ownerId,
    weekStart,
    days: weekDays(weekStart).map((date, i) => ({ dayIndex: i, date, kind: 'rest' as CfGroupDayKind })),
    updatedAt: new Date().toISOString(),
    updatedBy: ownerId,
  }
}

let blockSeq = 0
function newBlock(type: CfBlockType): CfGroupProgramBlock {
  blockSeq += 1
  return { id: `b-${blockSeq}-${Date.now()}`, type, title: '', content: '', order: 0 }
}

export default function CrossfitGrupoProgramacion({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const user = currentUser()
  const [weekStart, setWeekStart] = useState(getLocalWeekStart())
  const [draft, setDraft] = useState<CfGroupWeekDraft | null>(null)
  const [published, setPublished] = useState<CfGroupWeekDraft | null>(null)
  const [wods, setWods] = useState<CfWod[]>([])
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) { return }
    setError('')
    try {
      const [d, pub, weeks] = await Promise.all([
        isOwner ? getWeekDraft(groupId, weekStart) : Promise.resolve(null),
        getPublishedWeek(groupId, weekStart),
        isOwner ? listWods() : Promise.resolve([]),
      ])
      setDraft(isOwner ? (d ?? emptyWeek(groupId, user.uid, weekStart)) : null)
      setWods(weeks)
      setPublished(pub
        ? { groupId, ownerId: pub.publishedBy, weekStart, days: pub.days, updatedAt: pub.publishedAt, updatedBy: pub.publishedBy }
        : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la programación.')
    }
  }, [groupId, isOwner, user, weekStart])

  useEffect(() => { void load() }, [load])

  const currentDraft = isOwner ? draft : published
  const days: CfGroupProgramDay[] = currentDraft?.days ?? weekDays(weekStart).map((date, i) => ({ dayIndex: i, date, kind: 'rest' as CfGroupDayKind }))
  const today = todayKey()

  const setDay = (index: number, patch: Partial<CfGroupProgramDay>) => {
    setDraft((prev) => prev ? { ...prev, days: prev.days.map((d, i) => i === index ? { ...d, ...patch } : d) } : prev)
  }

  const setBlocks = (dayIndex: number, blocks: CfGroupProgramBlock[]) => {
    setDraft((prev) => prev ? {
      ...prev,
      days: prev.days.map((d, i) => i === dayIndex && d.session ? {
        ...d, session: { ...d.session, blocks: blocks.map((b, order) => ({ ...b, order })) },
      } : d),
    } : prev)
  }

  const updateBlock = (dayIndex: number, blockIndex: number, patch: Partial<CfGroupProgramBlock>) => {
    setDraft((prev) => prev ? {
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIndex || !d.session) { return d }
        return { ...d, session: { ...d.session, blocks: d.session.blocks.map((b, j) => j === blockIndex ? { ...b, ...patch } : b) } }
      }),
    } : prev)
  }

  const attachWod = async (dayIndex: number, blockIndex: number, wodId: string) => {
    if (!wodId) { return }
    try {
      const wod = await getWod(wodId)
      if (!wod) { setError('No se encontró el WOD.'); return }
      updateBlock(dayIndex, blockIndex, { wodSnapshot: createGroupWodSnapshot(wod) })
      setNotice('WOD incorporado como snapshot independiente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo incorporar el WOD.')
    }
  }

  const saveDraft = async () => {
    if (!draft) { return }
    setBusy('save'); setError(''); setNotice('')
    try {
      await saveWeekDraft({ ...draft, updatedAt: new Date().toISOString() })
      setNotice('Borrador guardado.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setBusy('') }
  }

  const publish = async () => {
    if (!window.confirm('¿Publicar esta semana completa? Se creará una nueva versión inmutable visible para los atletas.')) { return }
    setBusy('publish'); setError(''); setNotice('')
    try {
      if (draft) { await saveWeekDraft({ ...draft, updatedAt: new Date().toISOString() }) }
      const version = await publishWeekDraft(groupId, weekStart)
      setNotice(`Publicada versión ${version.versionNumber}.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo publicar.') } finally { setBusy('') }
  }

  const copyPrevious = async () => {
    setBusy('copy'); setError(''); setNotice('')
    try {
      await copyWeekToDraft({
        sourceGroupId: groupId,
        sourceWeekStart: addDaysToLocalDate(weekStart, -7),
        targetGroupId: groupId,
        targetWeekStart: weekStart,
      })
      await load()
      setNotice('Copiada la semana anterior.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No hay semana anterior para copiar.') } finally { setBusy('') }
  }

  return (
    <AltheaCard>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-headline text-lg font-semibold text-on-surface">Programación semanal</h3>
          <AltheaBadge variant={isOwner ? 'primary' : 'secondary'}>{isOwner ? 'Editar' : 'Solo lectura'}</AltheaBadge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <AltheaButton variant="secondary" className="min-h-[44px]" onClick={() => setWeekStart(addDaysToLocalDate(weekStart, -7))}>← Semana</AltheaButton>
          <span className="text-xs text-on-surface-variant">{weekStart}</span>
          <AltheaButton variant="secondary" className="min-h-[44px]" onClick={() => setWeekStart(addDaysToLocalDate(weekStart, 7))}>Semana →</AltheaButton>
        </div>

        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {notice && <p role="status" className="text-sm text-secondary">{notice}</p>}

        <ul className="space-y-2">
          {days.map((day, i) => {
            const isToday = day.date === today
            const ses = day.session
            return (
              <li key={day.date || i} className={`rounded-lg border p-3 space-y-2 ${isToday ? 'border-primary bg-primary/5' : 'border-outline-variant'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface">{DAY_NAMES[i]} <span className="text-xs text-on-surface-variant">{day.date}</span></p>
                  {isToday && <AltheaBadge variant="warning" className="shrink-0 whitespace-nowrap">Hoy</AltheaBadge>}
                </div>

                {isOwner ? (
                  <div className="space-y-2">
                    <AltheaSelect
                      label="Tipo"
                      value={day.kind}
                      onChange={(e) => setDay(i, {
                        kind: e.target.value as CfGroupDayKind,
                        session: e.target.value === 'session' ? (day.session ?? { title: '', objective: '', estimatedDurationMin: 60, equipment: [], instructions: [], blocks: [] }) : undefined,
                      })}
                      options={[{ value: 'rest', label: 'Descanso' }, { value: 'recovery', label: 'Recuperación' }, { value: 'session', label: 'Sesión' }]}
                    />
                    {day.kind === 'session' && ses && (
                      <div className="space-y-2 rounded-md bg-surface-container-low p-2">
                        <AltheaInput label="Título" value={ses.title} onChange={(e) => setDay(i, { session: { ...ses, title: e.target.value } })} />
                        <AltheaInput label="Objetivo" value={ses.objective} onChange={(e) => setDay(i, { session: { ...ses, objective: e.target.value } })} />
                        <AltheaInput label="Duración (min)" type="number" value={ses.estimatedDurationMin} onChange={(e) => setDay(i, { session: { ...ses, estimatedDurationMin: Number(e.target.value) || 0 } })} />
                        <AltheaTextarea label="Equipamiento (uno por línea)" value={ses.equipment.join('\n')} onChange={(e) => setDay(i, { session: { ...ses, equipment: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} />
                        <AltheaTextarea label="Instrucciones (una por línea)" value={ses.instructions.join('\n')} onChange={(e) => setDay(i, { session: { ...ses, instructions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} />

                        {ses.blocks.map((block, bi) => (
                          <div key={block.id} className="rounded border border-outline-variant p-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase text-on-surface-variant">{BLOCK_TYPES.find((t) => t.value === block.type)?.label}</span>
                              <div className="flex gap-1">
                                <AltheaButton variant="secondary" className="min-h-[32px] px-2" disabled={bi === 0} onClick={() => { const arr = [...ses.blocks]; [arr[bi - 1], arr[bi]] = [arr[bi], arr[bi - 1]]; setBlocks(i, arr) }}>↑</AltheaButton>
                                <AltheaButton variant="secondary" className="min-h-[32px] px-2" disabled={bi === ses.blocks.length - 1} onClick={() => { const arr = [...ses.blocks]; [arr[bi + 1], arr[bi]] = [arr[bi], arr[bi + 1]]; setBlocks(i, arr) }}>↓</AltheaButton>
                                <AltheaButton variant="danger" className="min-h-[32px] px-2" onClick={() => setBlocks(i, ses.blocks.filter((_x, j) => j !== bi))}>✕</AltheaButton>
                              </div>
                            </div>
                            <AltheaSelect label="Tipo de bloque" value={block.type} onChange={(e) => updateBlock(i, bi, { type: e.target.value as CfBlockType })} options={BLOCK_TYPES} />
                            <AltheaInput label="Título" value={block.title} onChange={(e) => updateBlock(i, bi, { title: e.target.value })} />
                            <AltheaTextarea label="Contenido" value={block.content} onChange={(e) => updateBlock(i, bi, { content: e.target.value })} />
                            {block.type === 'wod' && (
                              <AltheaSelect
                                label="WOD de mi biblioteca"
                                value=""
                                onChange={(e) => void attachWod(i, bi, e.target.value)}
                                options={[{ value: '', label: '— Elegir WOD —' }, ...wods.map((w) => ({ value: w.id, label: w.name }))]}
                              />
                            )}
                            {block.wodSnapshot && <p className="text-[11px] text-on-surface-variant">WOD incorporado: {block.wodSnapshot.wod.name} (snapshot independiente)</p>}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-1">
                          {BLOCK_TYPES.map((t) => (
                            <AltheaButton key={t.value} variant="secondary" className="min-h-[36px] px-2" onClick={() => setBlocks(i, [...ses.blocks, newBlock(t.value)])}>+ {t.label}</AltheaButton>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm">
                    {day.kind === 'rest' && <p className="text-on-surface-variant">Descanso</p>}
                    {day.kind === 'recovery' && <p className="text-on-surface-variant">Recuperación</p>}
                    {day.kind === 'session' && ses && (
                      <div className="space-y-1">
                        <p className="font-semibold text-on-surface">{ses.title}</p>
                        {ses.objective && <p className="text-xs text-on-surface-variant">{ses.objective}</p>}
                        {ses.estimatedDurationMin > 0 && <p className="text-xs text-on-surface-variant">🕒 {ses.estimatedDurationMin} min</p>}
                        {ses.equipment.length > 0 && <p className="text-xs text-on-surface-variant">Equipamiento: {ses.equipment.join(', ')}</p>}
                        {ses.instructions.length > 0 && <ul className="text-xs list-disc list-inside text-on-surface-variant">{ses.instructions.map((ins, k) => <li key={k}>{ins}</li>)}</ul>}
                        <ul className="space-y-1 mt-1">
                          {ses.blocks.map((block) => (
                            <li key={block.id} className="rounded border border-outline-variant p-2">
                              <p className="text-[11px] uppercase text-on-surface-variant">{BLOCK_TYPES.find((t) => t.value === block.type)?.label}</p>
                              <p className="text-xs font-semibold text-on-surface">{block.title || block.type}</p>
                              {block.content && <p className="text-xs text-on-surface-variant whitespace-pre-wrap">{block.content}</p>}
                              {block.wodSnapshot && <p className="text-xs text-on-surface-variant">WOD: {block.wodSnapshot.wod.name}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {!isOwner && !published && <p className="text-sm text-on-surface-variant">Todavía no hay programación publicada para esta semana.</p>}

        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <AltheaButton variant="secondary" className="min-h-[44px]" disabled={busy === 'copy'} onClick={() => void copyPrevious()}>Copiar semana anterior</AltheaButton>
            <AltheaButton variant="secondary" className="min-h-[44px]" loading={busy === 'save'} onClick={() => void saveDraft()}>Guardar borrador</AltheaButton>
            <AltheaButton className="min-h-[44px]" loading={busy === 'publish'} onClick={() => void publish()}>Publicar semana</AltheaButton>
          </div>
        )}
      </div>
    </AltheaCard>
  )
}
