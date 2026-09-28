import { useEffect, useState } from 'react'
import { loadUnifiedConfigs, saveUnifiedConfig, saveUnifiedConfigs, type UnifiedNotifConfig } from '@/services/notifications/unifiedNotifications'

const TYPES = ['comer', 'agua', 'recuperacion', 'entrenamiento'] as const

export function DailyRemindersConfig() {
  const [configs, setConfigs] = useState<UnifiedNotifConfig[]>([])
  const [editing, setEditing] = useState<Record<string, Partial<UnifiedNotifConfig>>>({})

  const load = async () => {
    const all = await loadUnifiedConfigs()
    setConfigs(all.filter(c => (TYPES as readonly string[]).includes(c.type)))
  }
  useEffect(() => { load() }, [])

  const toggleEnabled = async (c: UnifiedNotifConfig) => {
    await saveUnifiedConfig({ ...c, enabled: !c.enabled })
    await load()
  }

  const updateField = async (id: string, patch: Partial<UnifiedNotifConfig>) => {
    const cfg = configs.find(x => x.id === id)
    if (!cfg) {return}
    await saveUnifiedConfig({ ...cfg, ...patch } as UnifiedNotifConfig)
    await load()
  }

  const handleDelete = async (id: string) => {
    const next = configs.filter(c => c.id !== id)
    // mantener al menos uno por tipo? permitir eliminar, luego recrea si vacío
    await saveUnifiedConfigs([...(await loadUnifiedConfigs()).filter(x => !(TYPES as readonly string[]).includes(x.type) || x.id !== id), ...[]])
    // si usamos saveUnifiedConfigs directo, borrar
    const all = await loadUnifiedConfigs()
    const filtered = all.filter(x => x.id !== id)
    await saveUnifiedConfigs(filtered)
    await load()
  }

  const handleCreate = async (type: typeof TYPES[number]) => {
    const id = `${type}-${Date.now()}`
    const base = configs.find(c => c.type === type) || { type, title: type, time: '12:00', times: ['12:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily' as const, enabled: false, requiredAction: false }
    const cfg: UnifiedNotifConfig = {
      id,
      type,
      title: base.title || type,
      enabled: false,
      time: (base as UnifiedNotifConfig).time || '12:00',
      times: [(base as UnifiedNotifConfig).time || '12:00'],
      days: (base as UnifiedNotifConfig).days || [true, true, true, true, true, true, true],
      recurrence: (base as UnifiedNotifConfig).recurrence || 'daily',
      requiredAction: false,
      updatedAt: new Date().toISOString(),
    }
    await saveUnifiedConfig(cfg)
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Recordatorios diarios — comer, agua, recuperación, entrenar</div>
      <p className="font-body-sm text-xs text-on-surface-variant">Horario, título (definido por vos), activo/inactivo, recurrencia. Simples, sin textos largos.</p>
      {configs.map(c => (
        <div key={c.id} className="rounded border border-outline-variant/40 bg-surface-container p-3 space-y-2">
          <div className="flex items-center gap-2 justify-between">
            <span className="font-label-caps text-[10px] uppercase text-secondary">{c.type}</span>
            <label className="flex items-center gap-1 font-body-sm text-xs">
              <input type="checkbox" checked={c.enabled} onChange={() => toggleEnabled(c)} />
              activo
            </label>
          </div>
          <input
            value={editing[c.id]?.title ?? c.title}
            onChange={e => setEditing(prev => ({ ...prev, [c.id]: { ...prev[c.id], title: e.target.value } }))}
            onBlur={e => updateField(c.id, { title: e.target.value })}
            placeholder="Título"
            className="w-full bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"
          />
          <div className="flex gap-2 items-center">
            <input
              type="time"
              value={editing[c.id]?.time ?? c.time}
              onChange={e => setEditing(prev => ({ ...prev, [c.id]: { ...prev[c.id], time: e.target.value } }))}
              onBlur={e => updateField(c.id, { time: e.target.value, times: [e.target.value] })}
              className="bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"
            />
            <select
              value={c.recurrence}
              onChange={e => updateField(c.id, { recurrence: e.target.value as never, days: e.target.value === 'daily' ? [true, true, true, true, true, true, true] : e.target.value === 'weekdays' ? [true, true, true, true, true, false, false] : c.days })}
              className="bg-surface border border-outline-variant rounded p-2 font-label-caps text-[10px] uppercase"
            >
              <option value="daily">diario</option>
              <option value="weekdays">lun-vie</option>
              <option value="custom">personalizado</option>
            </select>
            <button onClick={() => handleDelete(c.id)} className="ml-auto text-error text-xs">Eliminar</button>
          </div>
          {c.recurrence === 'custom' && (
            <div className="flex gap-1 flex-wrap">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((lbl, idx) => (
                <label key={idx} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={c.days[idx]} onChange={e => {
                    const days = [...c.days]; days[idx] = e.target.checked
                    updateField(c.id, { days })
                  }} />
                  {lbl}
                </label>
              ))}
            </div>
          )}
          {c.type === 'recuperacion' && (
            <label className="flex items-center gap-2 font-body-sm text-xs text-on-surface-variant">
              <input type="checkbox" checked={c.requiredAction} onChange={e => updateField(c.id, { requiredAction: e.target.checked })} />
              acción obligatoria (bloquea hasta completar)
            </label>
          )}
          {c.type === 'agua' && <p className="font-body-sm text-[11px] text-on-surface-variant">Usa botellas reales: el recordatorio sigue aunque hayas tomado parte.</p>}
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        {TYPES.map(t => (
          <button key={t} onClick={() => handleCreate(t)} className="px-3 py-1.5 rounded border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">
            + {t}
          </button>
        ))}
      </div>
    </div>
  )
}
