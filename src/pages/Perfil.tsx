import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { v4 as uuid } from 'uuid'
import { Link } from 'react-router-dom'
import { exportJSON, exportCSV, downloadBlob, importJSON, exportPDF } from '@/services/storage/export'
import * as Push from '@/services/notifications/push'
import * as Sync from '@/services/sync/queue'
import { applyAppearance, getTheme, getTextScale, setAppearance as saveAppearance } from '@/utils/appearance'
import { loadConfigs, saveConfigs, requestPermission, permissionStatus, type NotifConfig } from '@/services/notifications/scheduler'
import { selectMethods } from '@/services/ai/methodSelector'
import { selectNutritionMethods } from '@/services/ai/nutritionMethodSelector'
import type { NutritionMethodRecommendation } from '@/services/ai/nutritionMethods'
import { getNutritionMethod } from '@/services/ai/nutritionMethodsDB'
import { buildCycleFromRecommendation } from '@/utils/cycle'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import BrandIcon from '@/components/brand/BrandIcon'
import { AltheaCard, AltheaCardHeader, AltheaInput, AltheaButton } from '@/components/althea'

const WEEK_DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

function NotifSection(){
  const [cfgs,setCfgs]=useState<NotifConfig[]>(()=> loadConfigs())
  const [perm,setPerm]=useState<NotificationPermission|'unknown'>('unknown')
  const [newTime,setNewTime]=useState<Record<string,string>>({})
  useEffect(()=>{ permissionStatus().then(setPerm).catch(()=> setPerm('unknown')) },[])
  const upd = (id:string, patch:Partial<NotifConfig>)=>{
    const nx = cfgs.map(c=> c.id===id ? { ...c, ...patch } : c)
    setCfgs(nx); saveConfigs(nx)
  }
  const askPerm = async ()=>{
    const p = await requestPermission()
    setPerm(p)
    if(p!=='granted') alert('Permiso denegado: activá las notificaciones en el navegador para recibir avisos.')
  }
  return (
    <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-3 marble-slab">
      <div className="flex items-center justify-between">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Notificaciones</div>
        <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Permiso: {perm==='granted' ? 'concedido' : perm==='denied' ? 'denegado' : perm}</span>
      </div>
      {perm!=='granted' && <button onClick={askPerm} className="w-full py-2 rounded bg-primary text-on-surface">Permitir notificaciones</button>}
      <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hora local del dispositivo · se disparan con la app abierta · cada horario se envía una sola vez por día.</p>
      {cfgs.map((c)=>(
        <div key={c.id} className="rounded bg-surface/60 border border-outline-variant p-3 space-y-2">
          <label className="flex items-center justify-between gap-2">
            <span className="font-body-md text-sm text-on-surface font-medium">{c.title}</span>
            <input type="checkbox" checked={c.enabled} onChange={e=>upd(c.id,{enabled:e.target.checked})} className="w-5 h-5 accent-action" aria-label={`Activar ${c.title}`} />
          </label>
          {c.kind==='proteina' && (
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Objetivo (g)<input type="number" value={c.extra||''} onChange={e=>upd(c.id,{extra:e.target.value})} placeholder="Ej: 140" className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          )}
          <div className="flex flex-wrap gap-1">
            {c.times.map((t)=>(
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                {t}
                <button onClick={()=>upd(c.id,{times:c.times.filter(x=>x!==t)})} aria-label={`Quitar horario ${t}`} className="text-on-surface-variant flex"><BrandIcon name="close" size={12}/></button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input type="time" value={newTime[c.id]||''} onChange={e=>setNewTime({...newTime,[c.id]:e.target.value})} className="flex-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" aria-label="Nuevo horario" />
            <button onClick={()=>{ const v=(newTime[c.id]||'').slice(0,5); if(!v || c.times.includes(v)) return; upd(c.id,{times:[...c.times,v].sort()}) }} className="px-3 rounded bg-surface border border-outline-variant font-body-md text-sm text-on-surface">+</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((d,i)=>(
              <label key={d} className={`text-center font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant py-1.5 rounded-lg border cursor-pointer ${c.days[i] ? 'bg-surface-container-high border-info text-on-surface' : 'bg-surface border-outline-variant text-on-surface-variant'}`}>
                <input type="checkbox" checked={!!c.days[i]} onChange={e=>{ const days=[...c.days]; days[i]=e.target.checked; upd(c.id,{days}) }} className="hidden" />
                {d}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AccountSection(){
  const [email,setEmail]=useState<string|null>(null)
  const [configured,setConfigured]=useState(true)
  const [syncing,setSyncing]=useState(false)
  const [msg,setMsg]=useState('')
  const [lastSync,setLastSync]=useState<string|null>(null)
  useEffect(()=>{
    import('@/services/firebase/config').then(({ isFirebaseConfigured })=>{
      setConfigured(isFirebaseConfigured())
      if(!isFirebaseConfigured()) return
      import('@/services/firebase/auth').then(({ onUser })=>{
        onUser((u)=> setEmail(u?.email || null))
      })
      import('@/services/firebase/sync').then(({ lastSyncAt })=> setLastSync(lastSyncAt()))
    })
  },[])
  if(!configured){
    return (
      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2 marble-slab">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cuenta y sincronización</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">Firebase no configurado: la app funciona solo en este dispositivo. Agregá las variables VITE_FIREBASE_* en un archivo .env para activar cuenta y nube.</p>
      </div>
    )
  }
  const doSync = async ()=>{
    setMsg('')
    setSyncing(true)
    try{
      const { currentUser } = await import('@/services/firebase/auth')
      const u = currentUser()
      if(!u){ setMsg('Iniciá sesión para sincronizar.'); return }
      const { syncAll, lastSyncAt } = await import('@/services/firebase/sync')
      const r = await syncAll(u.uid, (m)=> setMsg(m))
      setLastSync(lastSyncAt())
      setMsg(`Sincronizado: ${r.uploaded} subidos, ${r.downloaded} descargados.`)
    }catch(e:any){
      setMsg(e?.message || 'Falló la sincronización.')
    }finally{
      setSyncing(false)
    }
  }
  return (
    <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2 marble-slab">
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cuenta y sincronización</div>
      {email ? (
        <>
          <p className="font-body-md text-sm text-on-surface">{email}</p>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Última sincronización: {lastSync ? new Date(lastSync).toLocaleString('es') : 'nunca'}</p>
          <button onClick={doSync} disabled={syncing} className="btn-primary w-full disabled:opacity-50">
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button
            onClick={async()=>{
              if(!confirm('¿Cerrar sesión en este dispositivo? Tus datos locales se conservan.')) return
              setMsg('Haciendo backup antes de salir…')
              try{
                const { currentUser } = await import('@/services/firebase/auth')
                const u = currentUser()
                if(u && navigator.onLine){
                  const { syncAll } = await import('@/services/firebase/sync')
                  await syncAll(u.uid)
                }
              }catch(e:any){
                if(!confirm(`El backup falló (${e?.message || 'sin conexión'}). ¿Salir igual? Tus datos quedan en este dispositivo.`)) return
              }
              const { signOut } = await import('@/services/firebase/auth')
              await signOut()
              setEmail(null)
              setMsg('')
            }}
            className="btn-secondary w-full"
          >
            Cerrar sesión
          </button>
        </>
      ) : (
        <>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">Sin sesión iniciada en este dispositivo.</p>
          <Link to="/login" className="btn-primary w-full">Iniciar sesión / crear cuenta</Link>
        </>
      )}
      {msg && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{msg}</p>}
    </div>
  )
}

function PushSection(){
  const [supported,setSupported]=useState<boolean|null>(null)
  const [active,setActive]=useState(false)
  const [msg,setMsg]=useState('')
  useEffect(()=>{
    import('@/services/firebase/messaging').then(async ({ isPushSupported, savedToken })=>{
      const ok = await isPushSupported()
      setSupported(ok)
      setActive(!!savedToken())
    })
  },[])
  if(supported===false) return null
  const enable = async ()=>{
    setMsg('')
    try{
      const { enablePush } = await import('@/services/firebase/messaging')
      await enablePush()
      setActive(true)
      setMsg('Push activado en este dispositivo.')
    }catch(e:any){
      setMsg(e?.message || 'No se pudo activar push.')
    }
  }
  const test = ()=>{
    try{
      new Notification('Althea', { body: 'Las notificaciones push funcionan en este dispositivo.' } as any)
    }catch{
      setMsg('El navegador bloqueó la notificación de prueba.')
    }
  }
  return (
    <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2 marble-slab">
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Notificaciones push</div>
      <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">Avisos desde la nube (requieren despliegue en Firebase Hosting). Estado: {active ? 'activado' : 'apagado'}</p>
      <div className="flex gap-2">
        <button onClick={enable} disabled={active} className="btn-primary flex-1 disabled:opacity-50">Activar push</button>
        <button onClick={test} className="btn-secondary flex-1">Probar</button>
      </div>
      {msg && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{msg}</p>}
    </div>
  )
}

const TRAINING_GOALS: { value: string; label: string; desc: string; icon: string }[] = [
  { value: 'strength', label: 'Fuerza', desc: 'Progresión de cargas, multiarticulares, técnica', icon: '💪' },
  { value: 'fat_loss', label: 'Pérdida de grasa', desc: 'Déficit moderado, adherencia, fuerza', icon: '🔥' },
  { value: 'hypertrophy', label: 'Hipertrofia', desc: 'Volumen, proximidad al fallo, ROM', icon: '🏋️' },
  { value: 'mobility', label: 'Movilidad', desc: 'ROM, calidad de movimiento, control', icon: '🧘' },
  { value: 'general_health', label: 'Salud general', desc: 'Equilibrio, adherencia, sostenibilidad', icon: '❤️' },
]
const EXPERIENCE_LEVELS: { value: string; label: string; desc: string }[] = [
  { value: 'beginner', label: 'Principiante', desc: '<6 meses entrenando' },
  { value: 'intermediate', label: 'Intermedio', desc: '6 meses - 2 años' },
  { value: 'advanced', label: 'Avanzado', desc: '>2 años constante' },
]

export default function Perfil(){
  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({ age:'', sex:'', heightCm:'', weightKg:'', targetWeightKg:'', bodyFatPct:'', muscleMassKg:'', waistCm:'', chestCm:'', activityLevel:'moderado' })
  const [coachForm,setCoachForm]=useState({ trainingGoal:'hypertrophy', experienceLevel:'intermediate', sessionDurationMin:'60', preferredTime:'18:00', restrictions:'', allergies:'', dislikedFoods:'', mealFrequency:'4' })
  const [methodRec,setMethodRec]=useState<{primary:string;secondary:string[];complementary:string[];justification:string;confidence:number;mixed?:any}|null>(null)
  const [applying,setApplying]=useState(false)
  const [activeCycleMethod,setActiveCycleMethod]=useState<{methodId?:string;days?:number;split?:string}|null>(null)
  const [nutritionRec,setNutritionRec]=useState<NutritionMethodRecommendation | null>(null)
  const [activeNutritionMethod,setActiveNutritionMethod]=useState<string | null>(null)
  const [applyingNutrition,setApplyingNutrition]=useState(false)
  const [history,setHistory]=useState<any[]>([])
  const [theme,setTheme]=useState(getTheme)
  const [textScale,setTextScale]=useState(getTextScale)
  const setAppearance = (t:'dark'|'light', s:'s'|'m'|'l')=>{
    setTheme(t); setTextScale(s)
    saveAppearance(t, s)
    applyAppearance()
  }

  useEffect(()=>{
    db.userProfile.get('me').then(p=>{
      if(p){ setProfile(p); setForm({
        age: String(p.age||''), sex: p.sex||'', heightCm: String(p.heightCm||''), weightKg: String(p.weightKg||''),
        targetWeightKg: String((p as any).targetWeightKg||''), bodyFatPct: String(p.bodyFatPct||''), muscleMassKg: String(p.muscleMassKg||''),
        waistCm:'', chestCm:'', activityLevel: (p as any).activityLevel || 'moderado'
      } as any)
        setCoachForm({
          trainingGoal: (p as any).trainingGoal || 'hypertrophy',
          experienceLevel: (p as any).experienceLevel || 'intermediate',
          sessionDurationMin: String((p as any).preferences?.sessionDurationMin || '60'),
          preferredTime: (p as any).schedule?.preferredTime || '18:00',
          restrictions: ((p as any).nutritionPrefs?.restrictions || []).join(', '),
          allergies: ((p as any).nutritionPrefs?.allergies || []).join(', '),
          dislikedFoods: ((p as any).nutritionPrefs?.dislikedFoods || []).join(', '),
          mealFrequency: String((p as any).nutritionPrefs?.mealFrequency || '4'),
        })
      }
    })
    db.table('bodyMeasurements').toArray().then(setHistory).catch(()=> setHistory([]))
    // Calcular recomendación de método
    db.userProfile.get('me').then(p=>{
      if(p){
        const rec = selectMethods(p as any)
        setMethodRec({ primary:rec.primary, secondary:rec.secondary, complementary:rec.complementary, justification:rec.justification, confidence:rec.confidence, mixed:rec.mixed })
        // Load active cycle method
        const cycle = (p as any).cycle
        if(cycle?.methodId){
          const m = getMethod(cycle.methodId)
          setActiveCycleMethod({ methodId: cycle.methodId, days: cycle.trainingDays?.length, split: m?.structure?.splitType || m?.nameEs })
        }
        // Nutrition method
        const nutRec = selectNutritionMethods(p as any, cycle?.methodId)
        setNutritionRec(nutRec)
        const savedNutMethod = (p as any).activeNutritionMethod || (p as any).cycle?.nutritionMethodId
        if(savedNutMethod) setActiveNutritionMethod(savedNutMethod)
      }
    }).catch(()=>{})
  },[])

  const applyMethod = async ()=>{
    if(!profile || !methodRec) return
    setApplying(true)
    try{
      const availableDays = (profile as any).schedule?.availableDays || (profile as any).availableDays || [1,3,5]
      const cycle = buildCycleFromRecommendation({ primary: methodRec.primary as TrainingMethodId, mixed: methodRec.mixed, justification: methodRec.justification }, availableDays)
      await db.userProfile.put({ ...(profile as any), cycle, updatedAt: new Date().toISOString() })
      alert(`Método "${methodRec.primary}" aplicado. Ciclo actualizado con ${cycle.trainingDays.length} días.`)
    }catch(e:any){ alert('Error: '+(e.message||e)) }
    finally{ setApplying(false) }
  }

  const applyNutritionMethod = async ()=>{
    if(!profile || !nutritionRec) return
    setApplyingNutrition(true)
    try{
      await db.userProfile.put({ ...(profile as any), activeNutritionMethod: nutritionRec.primary, updatedAt: new Date().toISOString() })
      setActiveNutritionMethod(nutritionRec.primary)
      alert(`Estrategia nutricional "${getNutritionMethod(nutritionRec.primary)?.nameEs || nutritionRec.primary}" activada.`)
    }catch(e:any){ alert('Error: '+(e.message||e)) }
    finally{ setApplyingNutrition(false) }
  }

  const save = async ()=>{
    const data:any = {
      age: Number(form.age)||undefined,
      sex: form.sex||undefined,
      heightCm: Number(form.heightCm)||undefined,
      weightKg: Number(form.weightKg)||undefined,
      targetWeightKg: Number((form as any).targetWeightKg)||undefined,
      bodyFatPct: Number(form.bodyFatPct)||undefined,
      muscleMassKg: Number(form.muscleMassKg)||undefined,
      activityLevel: (form as any).activityLevel || 'moderado',
      trainingGoal: coachForm.trainingGoal,
      experienceLevel: coachForm.experienceLevel,
      preferences: { sessionDurationMin: Number(coachForm.sessionDurationMin)||60 },
      schedule: { preferredTime: coachForm.preferredTime },
      nutritionPrefs: {
        restrictions: coachForm.restrictions ? coachForm.restrictions.split(',').map(s=>s.trim()).filter(Boolean) : [],
        allergies: coachForm.allergies ? coachForm.allergies.split(',').map(s=>s.trim()).filter(Boolean) : [],
        dislikedFoods: coachForm.dislikedFoods ? coachForm.dislikedFoods.split(',').map(s=>s.trim()).filter(Boolean) : [],
        mealFrequency: Number(coachForm.mealFrequency)||4,
      },
    }
    const base = profile ?? { id:'me', goal:'hipertrofia', level:'intermedio', availableDays:[1,3,5], trainingTime:'18:00', equipment:['barra'], units:{weight:'kg',liquid:'ml'}, lang:'es', coachIntensity:'profesional', onboardingDone:true, hydrationGoalMl:2500, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
    await db.userProfile.put({ ...base, ...data, updatedAt: new Date().toISOString() })
    const today = new Date().toISOString().slice(0,10)
    await db.table('bodyMeasurements').put({ id: uuid(), localDate: today, weightKg: data.weightKg, heightCm: data.heightCm, bodyFatPct: data.bodyFatPct, muscleMassKg: data.muscleMassKg, waistCm: Number(form.waistCm)||undefined, chestCm: Number(form.chestCm)||undefined, createdAt: new Date().toISOString() })
    alert('Datos guardados.')
    setHistory(await db.table('bodyMeasurements').toArray())
  }

  const imc = form.heightCm && form.weightKg ? (Number(form.weightKg) / Math.pow(Number(form.heightCm)/100,2)).toFixed(1) : null
  const imcCat = imc ? (Number(imc)<18.5?'Bajo peso': Number(imc)<25?'Normopeso': Number(imc)<30?'Sobrepeso':'Obesidad') : null

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Perfil corporal</h1>
      <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Edad, sexo, altura, peso, medidas. El IMC se calcula solo si hay datos suficientes y se contextualiza — no es único indicador.</p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-3 marble-slab">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Edad<input value={form.age} onChange={e=>setForm({...form, age:e.target.value})} type="number" placeholder="ej: 28" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sexo
            <select value={form.sex} onChange={e=>setForm({...form, sex:e.target.value})} className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
              <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="X">X</option>
            </select>
          </label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Altura cm<input value={form.heightCm} onChange={e=>setForm({...form, heightCm:e.target.value})} type="number" placeholder="175" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso kg<input value={form.weightKg} onChange={e=>setForm({...form, weightKg:e.target.value})} type="number" step={0.1} placeholder="72" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso objetivo kg<input value={(form as any).targetWeightKg} onChange={e=>setForm({...form, targetWeightKg:e.target.value} as any)} type="number" step={0.1} placeholder="75" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Grasa %<input value={form.bodyFatPct} onChange={e=>setForm({...form, bodyFatPct:e.target.value})} type="number" step={0.1} placeholder="opcional" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculo kg<input value={form.muscleMassKg} onChange={e=>setForm({...form, muscleMassKg:e.target.value})} type="number" step={0.1} placeholder="opcional" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cintura cm<input value={form.waistCm} onChange={e=>setForm({...form, waistCm:e.target.value})} type="number" placeholder="opcional" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Pecho cm<input value={form.chestCm} onChange={e=>setForm({...form, chestCm:e.target.value})} type="number" placeholder="opcional" className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/></label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Actividad
            <select value={(form as any).activityLevel} onChange={e=>setForm({...form, activityLevel:e.target.value} as any)} className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
              <option value="sedentario">Sedentario</option><option value="poco_activo">Poco activo</option><option value="moderado">Moderadamente activo</option><option value="muy_activo">Muy activo</option><option value="extremadamente_activo">Extremadamente activo</option>
            </select>
          </label>
        </div>

        <div className="rounded bg-surface/60 border border-outline-variant p-3">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">IMC</div>
          {imc ? <><div className="font-headline-lg text-base font-semibold text-on-surface">{imc} · {imcCat}</div><p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Contexto: IMC solo con peso/altura. No evalúa composición. Para grasa/músculo registrar % y medidas.</p></> : <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Faltan altura y peso para calcular IMC. Una vez cargados, el sistema lo calculará.</p>}
          {form.bodyFatPct && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Grasa {form.bodyFatPct}% · Masa muscular {form.muscleMassKg||'—'} kg — datos registrados, no inferidos.</p>}
        </div>

        <button onClick={save} className="w-full py-3 rounded bg-primary text-on-surface font-medium">Guardar</button>
      </div>

      {/* ─── Coach IA v2: Perfil de entrenamiento ─── */}
      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-4 marble-slab">
        <div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Coach IA — Perfil de entrenamiento</div>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Definí tu objetivo y nivel. El Coach adapta sus recomendaciones a esto.</p>
        </div>

        <div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">Objetivo principal</div>
          <div className="grid grid-cols-1 gap-2">
            {TRAINING_GOALS.map(g=>(
              <button key={g.value} onClick={()=>setCoachForm({...coachForm, trainingGoal:g.value})}
                className={`p-3 rounded border text-left transition ${coachForm.trainingGoal===g.value ? 'bg-surface-container-high border-info' : 'bg-surface/60 border-outline-variant'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{g.icon}</span>
                  <div>
                    <div className="font-body-md text-sm text-on-surface font-medium">{g.label}</div>
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{g.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">Nivel de experiencia</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {EXPERIENCE_LEVELS.map(l=>(
              <button key={l.value} onClick={()=>setCoachForm({...coachForm, experienceLevel:l.value})}
                className={`py-2 rounded border text-center transition ${coachForm.experienceLevel===l.value ? 'bg-surface-container-high border-info' : 'bg-surface/60 border-outline-variant'}`}>
                <div className="font-body-md text-sm text-on-surface font-medium">{l.label}</div>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">{l.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Duración sesión (min)
            <select value={coachForm.sessionDurationMin} onChange={e=>setCoachForm({...coachForm, sessionDurationMin:e.target.value})}
              className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
              <option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option>
              <option value="75">75 min</option><option value="90">90 min</option>
            </select>
          </label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Horario preferido
            <input type="time" value={coachForm.preferredTime} onChange={e=>setCoachForm({...coachForm, preferredTime:e.target.value})}
              className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
          </label>
        </div>

        <div className="rounded bg-surface/60 border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nutrición — preferencias</div>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Restricciones alimentarias
            <input value={coachForm.restrictions} onChange={e=>setCoachForm({...coachForm, restrictions:e.target.value})}
              placeholder="Ej: vegetariano, sin lactosa" className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
          </label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Alergias
            <input value={coachForm.allergies} onChange={e=>setCoachForm({...coachForm, allergies:e.target.value})}
              placeholder="Ej: frutos secos, mariscos" className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
          </label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Alimentos que no te gustan
            <input value={coachForm.dislikedFoods} onChange={e=>setCoachForm({...coachForm, dislikedFoods:e.target.value})}
              placeholder="Ej: brócoli, atún" className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
          </label>
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Comidas por día
            <select value={coachForm.mealFrequency} onChange={e=>setCoachForm({...coachForm, mealFrequency:e.target.value})}
              className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
              <option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option>
            </select>
          </label>
        </div>
      </div>

      {/* ─── Ciclo activo ─── */}
      {activeCycleMethod && activeCycleMethod.methodId && (
        <div className="rounded bg-surface-container-high border border-info p-4 space-y-1 marble-slab">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant tracking-widest text-primary">MÉTODO ACTIVO</div>
          <div className="font-body-md text-sm text-on-surface font-medium">{getMethod(activeCycleMethod.methodId as TrainingMethodId)?.nameEs || activeCycleMethod.methodId}</div>
          {activeCycleMethod.days && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">{activeCycleMethod.days} días/semana · {activeCycleMethod.split || '—'}</div>}
          {profile && (profile as any).cycle?.methodJustification && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs text-on-surface-variant mt-1">{(profile as any).cycle.methodJustification}</div>}
        </div>
      )}

      {/* ─── Coach IA v2: Método recomendado ─── */}
      {methodRec && (
        <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-4 space-y-3 marble-slab">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant tracking-widest">MÉTODO DE ENTRENAMIENTO</div>
          <div>
            <div className="font-body-md text-sm text-on-surface font-medium">{methodRec.primary}</div>
            {methodRec.secondary.length > 0 && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs mt-0.5">Secundarios: {methodRec.secondary.join(', ')}</div>}
            {methodRec.complementary.length > 0 && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Complementarios: {methodRec.complementary.join(', ')}</div>}
          </div>
          {methodRec.mixed && (
            <div className="rounded-lg bg-surface/60 border border-outline-variant p-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs font-medium">Método Mixto</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs mt-0.5">{methodRec.mixed.structure?.distribution}</div>
            </div>
          )}
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs text-on-surface-variant">{methodRec.justification}</div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Confianza: {Math.round(methodRec.confidence * 100)}%</div>
          <button onClick={applyMethod} disabled={applying || !profile}
            className="w-full py-2 rounded bg-primary text-on-surface text-sm font-medium disabled:opacity-50">
            {applying ? 'Aplicando…' : 'Aplicar este método al ciclo'}
          </button>
        </div>
      )}

      {/* ─── Estrategia nutricional activa ─── */}
      {activeNutritionMethod && (
        <div className="rounded bg-surface-container-high border border-info p-4 space-y-1 marble-slab">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant tracking-widest text-primary">ESTRATEGIA NUTRICIONAL ACTIVA</div>
          <div className="font-body-md text-sm text-on-surface font-medium">{getNutritionMethod(activeNutritionMethod as any)?.nameEs || activeNutritionMethod}</div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs text-on-surface-variant">{getNutritionMethod(activeNutritionMethod as any)?.descriptionEs || ''}</div>
        </div>
      )}

      </div>

      {/* ─── Recomendación nutricional ─── */}
      {nutritionRec && (
        <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-4 space-y-3 marble-slab">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant tracking-widest">ESTRATEGIA NUTRICIONAL</div>
          <div>
            <div className="font-body-md text-sm text-on-surface font-medium">{getNutritionMethod(nutritionRec.primary)?.nameEs || nutritionRec.primary}</div>
            {nutritionRec.secondary.length > 0 && (
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs mt-0.5">Secundarios: {nutritionRec.secondary.map(id => getNutritionMethod(id)?.nameEs || id).join(', ')}</div>
            )}
            {nutritionRec.complementary.length > 0 && (
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Complementarios: {nutritionRec.complementary.map(id => getNutritionMethod(id)?.nameEs || id).join(', ')}</div>
            )}
          </div>
          {nutritionRec.mixed && (
            <div className="rounded-lg bg-surface/60 border border-outline-variant p-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs font-medium">Estrategia Mixta</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs mt-0.5">{nutritionRec.mixed.strategy?.timingStrategy}</div>
              {nutritionRec.mixed.strategy?.keyPrinciples && (
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs mt-1">Principios: {nutritionRec.mixed.strategy.keyPrinciples.slice(0, 3).join(' · ')}</div>
              )}
            </div>
          )}
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs text-on-surface-variant">{nutritionRec.justification}</div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Confianza: {Math.round(nutritionRec.confidence * 100)}%</div>
          {nutritionRec.safetyWarnings.length > 0 && (
            <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 p-2">
              <div className="text-xs text-yellow-400 font-medium">⚠ Seguridad</div>
              {nutritionRec.safetyWarnings.map((w,i) => <div key={i} className="text-xs text-yellow-300/80 mt-0.5">• {w}</div>)}
            </div>
          )}
          <button onClick={applyNutritionMethod} disabled={applyingNutrition || !profile || activeNutritionMethod === nutritionRec.primary}
            className="w-full py-2 rounded bg-primary text-on-surface text-sm font-medium disabled:opacity-50">
            {applyingNutrition ? 'Activando…' : activeNutritionMethod === nutritionRec.primary ? 'Ya activo' : 'Activar esta estrategia'}
          </button>
        </div>
      )}

      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
      <div className="rounded bg-surface-container-high border border-info p-4 space-y-1 marble-slab">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant tracking-widest text-primary">RESUMEN</div>
        {imc && <div className="font-body-md text-sm text-on-surface">IMC: {imc} · {imcCat}</div>}
        {form.weightKg && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Peso: {form.weightKg} kg</div>}
        {form.heightCm && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">Altura: {form.heightCm} cm</div>}
      </div>

      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-3 marble-slab">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Apariencia</div>
        <div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">Tema</div>
          <div className="grid grid-cols-2 gap-2">
            {(['dark','light'] as const).map((t)=>(
              <button key={t} onClick={()=> setAppearance(t, textScale)} className={`py-2 rounded border font-body-md text-sm text-on-surface ${theme===t ? 'bg-surface-container-high border-info' : 'bg-surface/60 border-outline-variant'}`}>
                {t==='dark' ? 'Oscuro navy' : 'Claro arena'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">Tamaño del texto</div>
          <div className="grid grid-cols-3 gap-2">
            {([['s','Chico'],['m','Mediano'],['l','Grande']] as const).map(([v,label])=>(
              <button key={v} onClick={()=> setAppearance(theme, v)} className={`py-2 rounded border font-body-md text-sm text-on-surface ${textScale===v ? 'bg-surface-container-high border-info' : 'bg-surface/60 border-outline-variant'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      </div>

      <AccountSection />

      <PushSection />

      <NotifSection />

      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 marble-slab">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Historial corporal (no se pierde al cerrar app)</div>
        {history.length===0 ? <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Sin registros aún.</p> : history.slice(-5).reverse().map((h:any)=><div key={h.id} className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{h.localDate}: {h.weightKg||'—'}kg · {h.bodyFatPct||'—'}% grasa</div>)}
      </div>

      <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2 marble-slab">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Datos de prueba</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Poblá historial coherente o borrá todo para iniciar de cero.</p>
        <button onClick={async()=>{
          const { seedCoherentHistory } = await import('@/services/storage/seeder')
          if(!confirm('¿Poblar con historial coherente de 4 semanas (12 sesiones) para probar sin estados vacíos?')) return
          await seedCoherentHistory(); alert('Seed coherente cargado — 4 semanas, progreso realista.')
        }} className="w-full py-2 rounded bg-primary text-bg">Poblar datos de prueba (Seeder)</button>
        <button onClick={async()=>{
          if(!confirm('¿Borrar PERMANENTEMENTE todo el historial? Esta acción no se puede deshacer.')) return
          if(!confirm('Confirmá nuevamente: se eliminarán sesiones, series, recuperación, peso e historial. ¿Continuar?')) return
          const { wipeDatabase } = await import('@/services/storage/seeder')
          await wipeDatabase(); alert('Base borrada. Podés poblar con Seeder para seguir probando.')
        }} className="w-full py-3 rounded bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 border border-red-700 shadow-lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M5 6l1 14h12l1-14"/></svg>
          Borrar base de datos
        </button>
      </div>

      <details className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 marble-slab">
        <summary className="font-body-md text-sm text-on-surface font-medium cursor-pointer">Ajustes avanzados</summary>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Funciones movidas desde Más para mantenerlo simple. Siguen disponibles aquí.</p>
        <div className="mt-3 space-y-2">
          <button onClick={async()=> downloadBlob(await exportJSON(), `trainpwa-backup-${new Date().toISOString().slice(0,10)}.json`)} className="w-full py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface">Exportar JSON</button>
          <button onClick={async()=> downloadBlob(await exportCSV(), `trainpwa-sets-${new Date().toISOString().slice(0,10)}.csv`)} className="w-full py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface">Exportar CSV</button>
          <button onClick={()=>exportPDF()} className="w-full py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface">Exportar PDF</button>
          <label className="w-full py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface text-center block cursor-pointer">Importar JSON<input type="file" accept=".json" onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; try{ await importJSON(f); alert('Importado OK')}catch(err:any){alert(err.message)}}} className="hidden"/></label>
          <button onClick={async()=>{
            const today=new Date().toISOString().slice(0,10); const sid=uuid(); await db.sessions.put({id:sid, localDate:today, startedAt:new Date().toISOString(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()}); for(let i=0;i<4;i++) await db.setLogs.put({id:uuid(), sessionId:sid, exerciseId:'ex-001', setNumber:i+1, weight:70+i*2.5, reps:8, completed:true, createdAt:new Date().toISOString()}); alert('Demo cargado')
          }} className="w-full py-2 rounded bg-primary text-on-surface">Cargar demo</button>
          <button onClick={async()=>{ await db.setLogs.clear(); await db.sessions.clear(); localStorage.removeItem('syncQueue'); alert('Demo eliminado')}} className="w-full py-2 rounded bg-surface border border-outline-variant font-body-md text-sm text-on-surface">Eliminar demo</button>
          <button onClick={async()=>{ const ok=await Push.sendNotification('seguimiento','Train PWA','¿Cómo venís con agua?'); if(!ok) alert('Límite 2/día o permiso denegado') }} className="w-full py-2 rounded bg-primary text-on-surface">Probar notificación</button>
          <button onClick={async()=>{ const r=await Sync.syncNow(); alert(`Sync ${r.synced}`)}} className="w-full py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface">Sincronizar ahora</button>
          <Link to="/onboarding" className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-primary underline block text-center">Reconfigurar Coach / Ciclo</Link>
        </div>
      </details>
    </div>
  )
}
