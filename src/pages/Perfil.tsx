import { useEffect, useState, useCallback } from 'react'
import { db } from '@/services/storage/db'
import { v4 as uuid } from 'uuid'
import { applyAppearance, getTheme, getTextScale, setAppearance as saveAppearance } from '@/utils/appearance'
import { loadConfigs, saveConfigs, requestPermission, permissionStatus, type NotifConfig, type NotifKind } from '@/services/notifications/scheduler'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import BrandIcon from '@/components/brand/BrandIcon'

const GOAL_MAP: Record<string, { label: string; icon: string; color: string }> = {
  hypertrophy: { label: 'Hipertrofia', icon: '🏋️', color: 'bg-primary-container/30 border-primary/40 text-primary' },
  strength: { label: 'Fuerza', icon: '💪', color: 'bg-secondary-container/30 border-secondary/40 text-secondary' },
  fat_loss: { label: 'Pérdida de grasa', icon: '🔥', color: 'bg-orange-900/30 border-orange-500/40 text-orange-400' },
  mobility: { label: 'Movilidad', icon: '🧘', color: 'bg-purple-900/30 border-purple-500/40 text-purple-400' },
  general_health: { label: 'Salud general', icon: '❤️', color: 'bg-red-900/30 border-red-500/40 text-red-400' },
}

const NOTIF_TYPES: { kind: NotifKind | 'custom'; label: string; icon: string }[] = [
  { kind: 'entrenamiento', label: 'Entrenamiento', icon: '💪' },
  { kind: 'agua', label: 'Hidratación', icon: '💧' },
  { kind: 'proteina', label: 'Nutrición', icon: '🥩' },
  { kind: 'recuperacion', label: 'Recuperación', icon: '😴' },
  { kind: 'cuestionario', label: 'Check-in', icon: '📋' },
  { kind: 'comoEstas', label: '¿Cómo estás?', icon: '🫀' },
  { kind: 'custom', label: 'Personalizada', icon: '✏️' },
]

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function imcCalc(weight: number, height: number) {
  if (!weight || !height) return null
  const v = weight / Math.pow(height / 100, 2)
  const cat = v < 18.5 ? 'Bajo peso' : v < 25 ? 'Normopeso' : v < 30 ? 'Sobrepeso' : 'Obesidad'
  return { value: v.toFixed(1), cat }
}

/* ─── Sección colapsable ─── */
function Section({ title, icon, children, defaultOpen = false }: { title: string; icon?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl bg-surface-container-low/80 backdrop-blur-sm border border-outline-variant/50 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-surface-container-high/30 transition-colors">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-lg">{icon}</span>}
          <span className="font-body-md text-[15px] text-on-surface font-medium">{title}</span>
        </div>
        <BrandIcon name={open ? 'expand_less' : 'expand_more'} size={20} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-outline-variant/30">{children}</div>}
    </div>
  )
}

/* ─── Modal de hora ─── */
function TimePickerModal({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const [h, setH] = useState(() => { const [hh = '08'] = value.split(':'); return hh })
  const [m, setM] = useState(() => { const [, mm = '00'] = value.split(':'); return mm })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-xs p-5 space-y-4">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface text-center">Seleccionar hora</h3>
        <div className="flex items-center justify-center gap-2">
          <select value={h} onChange={e => setH(e.target.value)} className="bg-surface-container-high border border-outline-variant rounded-lg p-3 font-headline-lg text-2xl text-on-surface w-20 text-center">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}
          </select>
          <span className="font-headline-lg text-2xl text-on-surface-variant">:</span>
          <select value={m} onChange={e => setM(e.target.value)} className="bg-surface-container-high border border-outline-variant rounded-lg p-3 font-headline-lg text-2xl text-on-surface w-20 text-center">
            {['00', '15', '30', '45'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
          <button onClick={() => { onChange(`${h}:${m}`); onClose() }} className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Guardar</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Modal crear notificación ─── */
function AddNotifModal({ onAdd, onClose }: { onAdd: (cfg: NotifConfig) => void; onClose: () => void }) {
  const [step, setStep] = useState<'type' | 'time'>('type')
  const [kind, setKind] = useState<NotifKind | 'custom'>('entrenamiento')
  const [customTitle, setCustomTitle] = useState('')
  const [time, setTime] = useState('08:00')

  const handleAdd = () => {
    const title = kind === 'custom' ? customTitle.trim() : NOTIF_TYPES.find(t => t.kind === kind)?.label || 'Recordatorio'
    if (!title) return
    onAdd({
      id: `custom_${Date.now()}`,
      kind: kind as NotifKind,
      title,
      enabled: true,
      times: [time],
      days: [true, true, true, true, true, false, false],
    })
    onClose()
  }

  if (step === 'time') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-xs p-5 space-y-4">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">¿A qué hora?</h3>
          <TimePickerModal value={time} onChange={setTime} onClose={() => {}} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setStep('type')} className="flex-1 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Atrás</button>
            <button onClick={handleAdd} className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Agregar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-xs p-5 space-y-4">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Nueva notificación</h3>
        <div className="space-y-2">
          {NOTIF_TYPES.map(t => (
            <button key={t.kind} onClick={() => setKind(t.kind)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${kind === t.kind ? 'bg-surface-container-high border-primary/50' : 'bg-surface-container/50 border-outline-variant/50 hover:border-outline-variant'}`}>
              <span className="text-lg">{t.icon}</span>
              <span className="font-body-md text-[15px] text-on-surface">{t.label}</span>
            </button>
          ))}
        </div>
        {kind === 'custom' && (
          <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="¿Qué quieres recordar?"
            className="w-full bg-surface-container-high/50 border border-outline-variant rounded-xl p-3 font-body-md text-[15px] text-on-surface" autoFocus />
        )}
        <button onClick={() => setStep('time')} className="w-full py-2.5 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Siguiente</button>
      </div>
    </div>
  )
}

/* ─── Main Perfil ─── */
export default function Perfil() {
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', age: '', sex: '', heightCm: '', weightKg: '', targetWeightKg: '', bodyFatPct: '', muscleMassKg: '', activityLevel: 'moderado', restrictions: '', allergies: '', dislikedFoods: '' })
  const [notifCfgs, setNotifCfgs] = useState<NotifConfig[]>([])
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unknown'>('unknown')
  const [showAddNotif, setShowAddNotif] = useState(false)
  const [editTimeId, setEditTimeId] = useState<string | null>(null)
  const [editTimeIdx, setEditTimeIdx] = useState<number>(0)
  const [theme, setTheme] = useState(getTheme)
  const [textScale, setTextScale] = useState(getTextScale)
  const [showLogout, setShowLogout] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [firebaseReady, setFirebaseReady] = useState(false)

  useEffect(() => {
    db.userProfile.get('me').then(p => {
      if (p) {
        setProfile(p)
        setForm({
          name: (p as any).displayName || (p as any).name || '',
          age: String(p.age || ''),
          sex: p.sex || '',
          heightCm: String(p.heightCm || ''),
          weightKg: String(p.weightKg || ''),
          targetWeightKg: String((p as any).targetWeightKg || ''),
          bodyFatPct: String(p.bodyFatPct || ''),
          muscleMassKg: String(p.muscleMassKg || ''),
          activityLevel: (p as any).activityLevel || 'moderado',
          restrictions: ((p as any).nutritionPrefs?.restrictions || (p as any).restrictions || []).join(', '),
          allergies: ((p as any).nutritionPrefs?.allergies || []).join(', '),
          dislikedFoods: ((p as any).nutritionPrefs?.dislikedFoods || []).join(', '),
        })
      }
    })
    setNotifCfgs(loadConfigs())
    permissionStatus().then(setNotifPerm).catch(() => setNotifPerm('unknown'))

    import('@/services/firebase/config').then(({ isFirebaseConfigured }) => {
      const ready = isFirebaseConfigured()
      setFirebaseReady(ready)
      if (ready) {
        import('@/services/firebase/auth').then(({ onUser }) => {
          onUser(u => setEmail(u?.email || null))
        })
      }
    }).catch(() => {})
  }, [])

  const saveProfile = async () => {
    const data: any = {
      displayName: form.name || undefined,
      age: Number(form.age) || undefined,
      sex: form.sex || undefined,
      heightCm: Number(form.heightCm) || undefined,
      weightKg: Number(form.weightKg) || undefined,
      targetWeightKg: Number(form.targetWeightKg) || undefined,
      bodyFatPct: Number(form.bodyFatPct) || undefined,
      muscleMassKg: Number(form.muscleMassKg) || undefined,
      activityLevel: form.activityLevel,
      restrictions: form.restrictions ? form.restrictions.split(',').map(s => s.trim()).filter(Boolean) : [],
      nutritionPrefs: {
        restrictions: form.restrictions ? form.restrictions.split(',').map(s => s.trim()).filter(Boolean) : [],
        allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        dislikedFoods: form.dislikedFoods ? form.dislikedFoods.split(',').map(s => s.trim()).filter(Boolean) : [],
      },
    }
    const base = profile ?? { id: 'me', onboardingDone: true, createdAt: new Date().toISOString() }
    await db.userProfile.put({ ...base, ...data, updatedAt: new Date().toISOString() })
    setProfile({ ...base, ...data })
    const today = new Date().toISOString().slice(0, 10)
    await db.table('bodyMeasurements').put({
      id: uuid(), localDate: today, weightKg: data.weightKg, heightCm: data.heightCm,
      bodyFatPct: data.bodyFatPct, muscleMassKg: data.muscleMassKg, createdAt: new Date().toISOString()
    })
    setEditing(false)
  }

  const updateGoal = async (goal: string) => {
    if (!profile) return
    await db.userProfile.put({ ...profile, trainingGoal: goal, updatedAt: new Date().toISOString() })
    setProfile({ ...profile, trainingGoal: goal })
  }

  const toggleNotif = (id: string) => {
    const nx = notifCfgs.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const addNotif = (cfg: NotifConfig) => {
    const nx = [...notifCfgs, cfg]
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const removeNotif = (id: string) => {
    const nx = notifCfgs.filter(c => c.id !== id)
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const updateTime = (id: string, oldTime: string, newTime: string) => {
    const nx = notifCfgs.map(c => {
      if (c.id !== id) return c
      const times = c.times.map(t => t === oldTime ? newTime : t).sort()
      return { ...c, times }
    })
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const addTime = (id: string, time: string) => {
    const nx = notifCfgs.map(c => c.id === id && !c.times.includes(time) ? { ...c, times: [...c.times, time].sort() } : c)
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const removeTime = (id: string, time: string) => {
    const nx = notifCfgs.map(c => c.id === id ? { ...c, times: c.times.filter(t => t !== time) } : c)
    setNotifCfgs(nx); saveConfigs(nx)
  }

  const handleLogout = async () => {
    if (!firebaseReady) return
    try {
      const { currentUser } = await import('@/services/firebase/auth')
      const u = currentUser()
      if (u && navigator.onLine) {
        const { syncAll } = await import('@/services/firebase/sync')
        await syncAll(u.uid)
      }
    } catch { /* noop */ }
    const { signOut } = await import('@/services/firebase/auth')
    await signOut()
    setEmail(null)
    setShowLogout(false)
    window.location.href = '/login'
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'ELIMINAR') return
    try {
      const { currentUser } = await import('@/services/firebase/auth')
      const u = currentUser()
      if (u) {
        const { deleteUser } = await import('firebase/auth')
        await deleteUser(u)
      }
    } catch { /* noop — local data still gets cleared */ }
    localStorage.clear()
    try { indexedDB.deleteDatabase('althea') } catch { /* noop */ }
    window.location.href = '/login'
  }

  const imc = imcCalc(Number(form.weightKg), Number(form.heightCm))
  const goal = GOAL_MAP[profile?.trainingGoal] || GOAL_MAP.hypertrophy
  const cycleMethod = profile?.cycle?.methodId ? getMethod(profile.cycle.methodId as TrainingMethodId) : null

  return (
    <div className="min-h-screen bg-transparent pb-24 max-w-[640px] w-full mx-auto px-4 py-6 space-y-4">

      {/* ═══ HEADER ═══ */}
      <div className="bg-surface-container-low/80 backdrop-blur-sm border border-outline-variant/50 rounded-2xl p-5 stone-slab relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary-container/8 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-container/30 border-2 border-primary/30 flex items-center justify-center shrink-0">
            <span className="font-headline-lg text-xl text-primary font-bold">{getInitials(form.name || 'A')}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-headline-lg text-lg text-on-surface font-semibold truncate">{form.name || 'Atleta'}</h1>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border mt-1 text-xs font-medium ${goal.color}`}>
              <span>{goal.icon}</span> {goal.label}
            </div>
          </div>
        </div>
        {(form.weightKg || form.heightCm) && (
          <div className="relative z-10 flex gap-4 mt-4 pt-3 border-t border-outline-variant/30">
            {form.weightKg && <div className="text-center"><div className="font-headline-sm text-[18px] text-on-surface font-semibold">{form.weightKg}</div><div className="font-label-caps text-[9px] uppercase text-on-surface-variant">kg</div></div>}
            {form.heightCm && <div className="text-center"><div className="font-headline-sm text-[18px] text-on-surface font-semibold">{form.heightCm}</div><div className="font-label-caps text-[9px] uppercase text-on-surface-variant">cm</div></div>}
            {imc && <div className="text-center"><div className="font-headline-sm text-[18px] text-on-surface font-semibold">{imc.value}</div><div className="font-label-caps text-[9px] uppercase text-on-surface-variant">IMC</div></div>}
          </div>
        )}
      </div>

      {/* ═══ DATOS PERSONALES ═══ */}
      <Section title="Datos personales" icon="👤" defaultOpen={false}>
        {editing ? (
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Nombre
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Edad
                <input value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} type="number" className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Sexo
                <select value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value })} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface">
                  <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="X">X</option>
                </select>
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Actividad
                <select value={form.activityLevel} onChange={e => setForm({ ...form, activityLevel: e.target.value })} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface">
                  <option value="sedentario">Sedentario</option><option value="poco_activo">Poco activo</option><option value="moderado">Moderado</option><option value="muy_activo">Muy activo</option><option value="extremadamente_activo">Extremadamente activo</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Peso kg
                <input value={form.weightKg} onChange={e => setForm({ ...form, weightKg: e.target.value })} type="number" step={0.1} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Altura cm
                <input value={form.heightCm} onChange={e => setForm({ ...form, heightCm: e.target.value })} type="number" className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Peso obj.
                <input value={form.targetWeightKg} onChange={e => setForm({ ...form, targetWeightKg: e.target.value })} type="number" step={0.1} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Grasa %
                <input value={form.bodyFatPct} onChange={e => setForm({ ...form, bodyFatPct: e.target.value })} type="number" step={0.1} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Músculo kg
                <input value={form.muscleMassKg} onChange={e => setForm({ ...form, muscleMassKg: e.target.value })} type="number" step={0.1} className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
              </label>
            </div>
            <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Restricciones alimentarias
              <input value={form.restrictions} onChange={e => setForm({ ...form, restrictions: e.target.value })} placeholder="Ej: vegetariano, sin lactosa" className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
            </label>
            <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Alergias
              <input value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} placeholder="Ej: frutos secos" className="w-full mt-1 bg-surface-container-high/50 border border-outline-variant rounded-lg p-2.5 font-body-md text-[15px] text-on-surface" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
              <button onClick={saveProfile} className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Guardar</button>
            </div>
          </div>
        ) : (
          <div className="pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {[
                ['Nombre', form.name || '—'],
                ['Edad', form.age ? `${form.age} años` : '—'],
                ['Sexo', form.sex || '—'],
                ['Peso', form.weightKg ? `${form.weightKg} kg` : '—'],
                ['Altura', form.heightCm ? `${form.heightCm} cm` : '—'],
                ['Peso obj.', form.targetWeightKg ? `${form.targetWeightKg} kg` : '—'],
                ['Grasa', form.bodyFatPct ? `${form.bodyFatPct}%` : '—'],
                ['Músculo', form.muscleMassKg ? `${form.muscleMassKg} kg` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-on-surface-variant">{k}</span><span className="text-on-surface font-medium">{v}</span></div>
              ))}
            </div>
            {(form.restrictions || form.allergies) && (
              <div className="pt-2 border-t border-outline-variant/30 space-y-1 text-sm">
                {form.restrictions && <div className="flex justify-between"><span className="text-on-surface-variant">Restricciones</span><span className="text-on-surface font-medium text-right max-w-[60%] truncate">{form.restrictions}</span></div>}
                {form.allergies && <div className="flex justify-between"><span className="text-on-surface-variant">Alergias</span><span className="text-on-surface font-medium text-right max-w-[60%] truncate">{form.allergies}</span></div>}
              </div>
            )}
            <button onClick={() => setEditing(true)} className="w-full py-2.5 rounded-lg bg-surface-container-high border border-outline-variant/50 font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-primary/50 transition-colors mt-2">
              Editar datos
            </button>
          </div>
        )}
      </Section>

      {/* ═══ OBJETIVO ═══ */}
      <Section title="Objetivo" icon="🎯">
        <div className="pt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(GOAL_MAP).map(([key, g]) => (
              <button key={key} onClick={() => updateGoal(key)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition ${profile?.trainingGoal === key ? `${g.color} border-current` : 'bg-surface-container/50 border-outline-variant/50 hover:border-outline-variant'}`}>
                <span className="text-lg">{g.icon}</span>
                <span className="font-body-md text-[15px]">{g.label}</span>
              </button>
            ))}
          </div>
          {cycleMethod && (
            <div className="mt-3 p-3 rounded-xl bg-primary-container/10 border border-primary/20">
              <div className="font-label-caps text-[9px] uppercase text-primary tracking-wider">Método activo</div>
              <div className="font-body-md text-[15px] text-on-surface font-medium mt-0.5">{cycleMethod.nameEs || profile?.cycle?.methodId}</div>
            </div>
          )}
        </div>
      </Section>

      {/* ═══ NOTIFICACIONES ═══ */}
      <Section title="Notificaciones" icon="🔔">
        <div className="pt-3 space-y-3">
          {notifPerm !== 'granted' && (
            <button onClick={async () => { const p = await requestPermission(); setNotifPerm(p) }}
              className="w-full py-2.5 rounded-lg bg-primary/20 border border-primary/30 text-primary font-label-caps text-[10px] uppercase font-bold">
              Permitir notificaciones
            </button>
          )}

          {notifCfgs.length === 0 && (
            <p className="text-center text-on-surface-variant text-sm py-4">Sin notificaciones configuradas</p>
          )}

          {notifCfgs.map(c => (
            <div key={c.id} className="rounded-xl bg-surface-container/50 border border-outline-variant/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-body-md text-[15px] text-on-surface font-medium truncate">{c.title}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.times.map(t => (
                      <button key={t} onClick={() => { setEditTimeId(c.id); setEditTimeIdx(c.times.indexOf(t)) }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container-high border border-outline-variant/50 font-mono text-[12px] text-on-surface-variant hover:border-primary/50 transition-colors">
                        {t}
                        <span onClick={e => { e.stopPropagation(); removeTime(c.id, t) }} className="text-on-surface-variant/60 hover:text-red-400">×</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => removeNotif(c.id)} className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <BrandIcon name="delete" size={16} />
                  </button>
                  <button onClick={() => toggleNotif(c.id)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${c.enabled ? 'bg-primary' : 'bg-surface-container-high'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-on-primary shadow transition-transform ${c.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
              <div className="flex gap-0.5">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <button key={d} onClick={() => {
                    const days = [...c.days]; days[i] = !days[i]
                    const nx = notifCfgs.map(x => x.id === c.id ? { ...x, days } : x)
                    setNotifCfgs(nx); saveConfigs(nx)
                  }}
                    className={`flex-1 py-1 rounded text-[10px] font-bold ${c.days[i] ? 'bg-primary/20 text-primary' : 'bg-surface-container-high text-on-surface-variant/40'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => setShowAddNotif(true)}
            className="w-full py-2.5 rounded-xl border border-dashed border-outline-variant/50 font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors">
            + Agregar notificación
          </button>
        </div>
      </Section>

      {/* ═══ PREFERENCIAS ═══ */}
      <Section title="Preferencias" icon="⚙️">
        <div className="pt-3 space-y-3">
          <div>
            <div className="font-label-caps text-[10px] uppercase text-outline tracking-wider mb-2">Apariencia</div>
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'light'] as const).map(t => (
                <button key={t} onClick={() => { setTheme(t); saveAppearance(t, textScale); applyAppearance() }}
                  className={`py-2.5 rounded-lg border font-body-md text-[15px] text-on-surface transition ${theme === t ? 'bg-surface-container-high border-primary/50' : 'bg-surface-container/50 border-outline-variant/50'}`}>
                  {t === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-label-caps text-[10px] uppercase text-outline tracking-wider mb-2">Tamaño del texto</div>
            <div className="grid grid-cols-3 gap-2">
              {([['s', 'Chico'], ['m', 'Mediano'], ['l', 'Grande']] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setTextScale(v as any); saveAppearance(theme, v as any); applyAppearance() }}
                  className={`py-2.5 rounded-lg border font-body-md text-[15px] text-on-surface transition ${textScale === v ? 'bg-surface-container-high border-primary/50' : 'bg-surface-container/50 border-outline-variant/50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ CUENTA ═══ */}
      <div className="space-y-2">
        {firebaseReady && email && (
          <div className="rounded-xl bg-surface-container-low/80 border border-outline-variant/50 p-4">
            <div className="font-label-caps text-[9px] uppercase text-on-surface-variant tracking-wider">Sesión activa</div>
            <div className="font-body-md text-[15px] text-on-surface font-medium mt-0.5">{email}</div>
          </div>
        )}

        <button onClick={() => setShowLogout(true)}
          className="w-full py-3.5 rounded-xl bg-surface-container-low/80 border border-outline-variant/50 font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-secondary/50 hover:text-secondary transition-colors">
          Cerrar sesión
        </button>

        <button onClick={() => setShowDelete(true)}
          className="w-full py-3.5 rounded-xl bg-red-950/30 border border-red-900/40 font-label-caps text-[10px] uppercase text-red-400 hover:bg-red-950/50 transition-colors">
          Eliminar cuenta
        </button>
      </div>

      {/* ═══ MODALS ═══ */}
      {showAddNotif && <AddNotifModal onAdd={addNotif} onClose={() => setShowAddNotif(false)} />}

      {editTimeId && (
        <TimePickerModal
          value={notifCfgs.find(c => c.id === editTimeId)?.times[editTimeIdx] || '08:00'}
          onChange={newTime => {
            const cfg = notifCfgs.find(c => c.id === editTimeId)
            if (cfg) updateTime(editTimeId, cfg.times[editTimeIdx], newTime)
          }}
          onClose={() => setEditTimeId(null)}
        />
      )}

      {showLogout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowLogout(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-xs p-5 space-y-4">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface text-center">¿Cerrar sesión?</h3>
            <p className="text-sm text-on-surface-variant text-center">Tus datos locales se conservan.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogout(false)} className="flex-1 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
              <button onClick={handleLogout} className="flex-1 py-2.5 rounded-lg bg-secondary text-on-secondary font-label-caps text-[10px] uppercase font-bold">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setShowDelete(false); setDeleteConfirm('') }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-container/95 backdrop-blur-md border border-red-900/50 rounded-2xl w-full max-w-xs p-5 space-y-4">
            <h3 className="font-headline-lg text-base font-semibold text-red-400 text-center">Eliminar cuenta</h3>
            <p className="text-sm text-on-surface-variant text-center">Esta acción eliminará tu cuenta y los datos asociados. No se puede deshacer.</p>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder='Escribí "ELIMINAR"'
              className="w-full bg-surface-container-high/50 border border-red-900/50 rounded-xl p-3 font-body-md text-[15px] text-on-surface text-center" />
            <div className="flex gap-2">
              <button onClick={() => { setShowDelete(false); setDeleteConfirm('') }} className="flex-1 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'ELIMINAR'} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-label-caps text-[10px] uppercase font-bold disabled:opacity-30">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
