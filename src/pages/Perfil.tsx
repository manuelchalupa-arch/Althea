import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { v4 as uuid } from 'uuid'
import { Link } from 'react-router-dom'
import { exportJSON, exportCSV, downloadBlob, importJSON, exportPDF } from '@/services/storage/export'
import * as Push from '@/services/notifications/push'
import * as Sync from '@/services/sync/queue'
import { applyAppearance, getTheme, getTextScale, setAppearance as saveAppearance } from '@/utils/appearance'
import { loadConfigs, saveConfigs, requestPermission, permissionStatus, type NotifConfig } from '@/services/notifications/scheduler'

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
    <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-aux font-medium">Notificaciones</div>
        <span className="text-aux">Permiso: {perm==='granted' ? 'concedido' : perm==='denied' ? 'denegado' : perm}</span>
      </div>
      {perm!=='granted' && <button onClick={askPerm} className="w-full py-2 rounded-xl bg-action text-textMain">Permitir notificaciones</button>}
      <p className="text-aux text-textMuted">Hora local del dispositivo · se disparan con la app abierta · cada horario se envía una sola vez por día.</p>
      {cfgs.map((c)=>(
        <div key={c.id} className="rounded-xl bg-bg border border-border p-3 space-y-2">
          <label className="flex items-center justify-between gap-2">
            <span className="text-body font-medium">{c.title}</span>
            <input type="checkbox" checked={c.enabled} onChange={e=>upd(c.id,{enabled:e.target.checked})} className="w-5 h-5 accent-action" aria-label={`Activar ${c.title}`} />
          </label>
          {c.kind==='proteina' && (
            <label className="text-aux">Objetivo (g)<input type="number" value={c.extra||''} onChange={e=>upd(c.id,{extra:e.target.value})} placeholder="Ej: 140" className="w-full mt-1 bg-surface border border-border rounded-xl p-2 text-body"/></label>
          )}
          <div className="flex flex-wrap gap-1">
            {c.times.map((t)=>(
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border text-aux">
                {t}
                <button onClick={()=>upd(c.id,{times:c.times.filter(x=>x!==t)})} aria-label={`Quitar horario ${t}`} className="text-textMuted">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input type="time" value={newTime[c.id]||''} onChange={e=>setNewTime({...newTime,[c.id]:e.target.value})} className="flex-1 bg-surface border border-border rounded-xl p-2 text-body" aria-label="Nuevo horario" />
            <button onClick={()=>{ const v=(newTime[c.id]||'').slice(0,5); if(!v || c.times.includes(v)) return; upd(c.id,{times:[...c.times,v].sort()}) }} className="px-3 rounded-xl bg-surface border border-border text-body">+</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((d,i)=>(
              <label key={d} className={`text-center text-aux py-1.5 rounded-lg border cursor-pointer ${c.days[i] ? 'bg-elevated border-info text-textMain' : 'bg-surface border-border text-textMuted'}`}>
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
      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="text-aux font-medium">Cuenta y sincronización</div>
        <p className="text-aux text-textMuted">Firebase no configurado: la app funciona solo en este dispositivo. Agregá las variables VITE_FIREBASE_* en un archivo .env para activar cuenta y nube.</p>
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
    <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
      <div className="text-aux font-medium">Cuenta y sincronización</div>
      {email ? (
        <>
          <p className="text-body">{email}</p>
          <p className="text-aux text-textMuted">Última sincronización: {lastSync ? new Date(lastSync).toLocaleString('es') : 'nunca'}</p>
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
          <p className="text-aux text-textMuted">Sin sesión iniciada en este dispositivo.</p>
          <Link to="/login" className="btn-primary w-full">Iniciar sesión / crear cuenta</Link>
        </>
      )}
      {msg && <p className="text-aux">{msg}</p>}
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
    <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
      <div className="text-aux font-medium">Notificaciones push</div>
      <p className="text-aux text-textMuted">Avisos desde la nube (requieren despliegue en Firebase Hosting). Estado: {active ? 'activado' : 'apagado'}</p>
      <div className="flex gap-2">
        <button onClick={enable} disabled={active} className="btn-primary flex-1 disabled:opacity-50">Activar push</button>
        <button onClick={test} className="btn-secondary flex-1">Probar</button>
      </div>
      {msg && <p className="text-aux">{msg}</p>}
    </div>
  )
}

export default function Perfil(){
  const [profile,setProfile]=useState<any>(null)
  const [form,setForm]=useState({ age:'', sex:'', heightCm:'', weightKg:'', targetWeightKg:'', bodyFatPct:'', muscleMassKg:'', waistCm:'', chestCm:'', activityLevel:'moderado' })
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
      } as any)}
    })
    db.table('bodyMeasurements').toArray().then(setHistory).catch(()=> setHistory([]))
  },[])

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
    }
    const base = profile ?? { id:'me', goal:'hipertrofia', level:'intermedio', availableDays:[1,3,5], trainingTime:'18:00', equipment:['barra'], units:{weight:'kg',liquid:'ml'}, lang:'es', coachIntensity:'profesional', onboardingDone:true, hydrationGoalMl:2500, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
    await db.userProfile.put({ ...base, ...data, updatedAt: new Date().toISOString() })
    const today = new Date().toISOString().slice(0,10)
    await db.table('bodyMeasurements').put({ id: uuid(), localDate: today, weightKg: data.weightKg, heightCm: data.heightCm, bodyFatPct: data.bodyFatPct, muscleMassKg: data.muscleMassKg, waistCm: Number(form.waistCm)||undefined, chestCm: Number(form.chestCm)||undefined, createdAt: new Date().toISOString() })
    alert('Datos guardados. No se inventa información faltante.')
    setHistory(await db.table('bodyMeasurements').toArray())
  }

  const imc = form.heightCm && form.weightKg ? (Number(form.weightKg) / Math.pow(Number(form.heightCm)/100,2)).toFixed(1) : null
  const imcCat = imc ? (Number(imc)<18.5?'Bajo peso': Number(imc)<25?'Normopeso': Number(imc)<30?'Sobrepeso':'Obesidad') : null

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <h1 className="text-section">Perfil corporal</h1>
      <p className="text-aux text-textMuted">Edad, sexo, altura, peso, medidas. El IMC se calcula solo si hay datos suficientes y se contextualiza — no es único indicador.</p>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-aux">Edad<input value={form.age} onChange={e=>setForm({...form, age:e.target.value})} type="number" placeholder="ej: 28" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Sexo
            <select value={form.sex} onChange={e=>setForm({...form, sex:e.target.value})} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body">
              <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="X">X</option>
            </select>
          </label>
          <label className="text-aux">Altura cm<input value={form.heightCm} onChange={e=>setForm({...form, heightCm:e.target.value})} type="number" placeholder="175" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Peso kg<input value={form.weightKg} onChange={e=>setForm({...form, weightKg:e.target.value})} type="number" step={0.1} placeholder="72" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Peso objetivo kg<input value={(form as any).targetWeightKg} onChange={e=>setForm({...form, targetWeightKg:e.target.value} as any)} type="number" step={0.1} placeholder="75" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Grasa %<input value={form.bodyFatPct} onChange={e=>setForm({...form, bodyFatPct:e.target.value})} type="number" step={0.1} placeholder="opcional" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Músculo kg<input value={form.muscleMassKg} onChange={e=>setForm({...form, muscleMassKg:e.target.value})} type="number" step={0.1} placeholder="opcional" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Cintura cm<input value={form.waistCm} onChange={e=>setForm({...form, waistCm:e.target.value})} type="number" placeholder="opcional" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Pecho cm<input value={form.chestCm} onChange={e=>setForm({...form, chestCm:e.target.value})} type="number" placeholder="opcional" className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          <label className="text-aux">Actividad
            <select value={(form as any).activityLevel} onChange={e=>setForm({...form, activityLevel:e.target.value} as any)} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body">
              <option value="sedentario">Sedentario</option><option value="poco_activo">Poco activo</option><option value="moderado">Moderadamente activo</option><option value="muy_activo">Muy activo</option><option value="extremadamente_activo">Extremadamente activo</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl bg-bg border border-border p-3">
          <div className="text-aux">IMC</div>
          {imc ? <><div className="text-subtitle">{imc} · {imcCat}</div><p className="text-aux text-textMuted">Contexto: IMC solo con peso/altura. No evalúa composición. Para grasa/músculo registrar % y medidas.</p></> : <p className="text-aux text-textMuted">Faltan altura y peso para calcular IMC. Una vez cargados, el sistema lo calculará.</p>}
          {form.bodyFatPct && <p className="text-aux">Grasa {form.bodyFatPct}% · Masa muscular {form.muscleMassKg||'—'} kg — datos registrados, no inferidos.</p>}
        </div>

        <button onClick={save} className="w-full py-3 rounded-xl bg-action text-textMain font-medium">Guardar</button>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div className="text-aux font-medium">Apariencia</div>
        <div>
          <div className="text-aux mb-1">Tema</div>
          <div className="grid grid-cols-2 gap-2">
            {(['dark','light'] as const).map((t)=>(
              <button key={t} onClick={()=> setAppearance(t, textScale)} className={`py-2 rounded-xl border text-body ${theme===t ? 'bg-elevated border-info' : 'bg-bg border-border'}`}>
                {t==='dark' ? 'Oscuro navy' : 'Claro arena'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-aux mb-1">Tamaño del texto</div>
          <div className="grid grid-cols-3 gap-2">
            {([['s','Chico'],['m','Mediano'],['l','Grande']] as const).map(([v,label])=>(
              <button key={v} onClick={()=> setAppearance(theme, v)} className={`py-2 rounded-xl border text-body ${textScale===v ? 'bg-elevated border-info' : 'bg-bg border-border'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AccountSection />

      <PushSection />

      <NotifSection />

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Historial corporal (no se pierde al cerrar app)</div>
        {history.length===0 ? <p className="text-aux text-textMuted mt-1">Sin registros aún.</p> : history.slice(-5).reverse().map((h:any)=><div key={h.id} className="text-aux mt-1">{h.localDate}: {h.weightKg||'—'}kg · {h.bodyFatPct||'—'}% grasa</div>)}
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="text-aux font-medium">Datos de prueba</div>
        <p className="text-aux text-textMuted">Poblá historial coherente o borrá todo para iniciar de cero.</p>
        <button onClick={async()=>{
          const { seedCoherentHistory } = await import('@/services/storage/seeder')
          if(!confirm('¿Poblar con historial coherente de 4 semanas (12 sesiones) para probar sin estados vacíos?')) return
          await seedCoherentHistory(); alert('Seed coherente cargado — 4 semanas, progreso realista.')
        }} className="w-full py-2 rounded-xl bg-info text-bg">Poblar datos de prueba (Seeder)</button>
        <button onClick={async()=>{
          if(!confirm('¿Borrar PERMANENTEMENTE todo el historial? Esta acción no se puede deshacer.')) return
          if(!confirm('Confirmá nuevamente: se eliminarán sesiones, series, recuperación, peso e historial. ¿Continuar?')) return
          const { wipeDatabase } = await import('@/services/storage/seeder')
          await wipeDatabase(); alert('Base borrada. Podés poblar con Seeder para seguir probando.')
        }} className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 border border-red-700 shadow-lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M5 6l1 14h12l1-14"/></svg>
          Borrar base de datos
        </button>
      </div>

      <details className="rounded-xl bg-surface border border-border p-3">
        <summary className="text-body font-medium cursor-pointer">Ajustes avanzados</summary>
        <p className="text-aux text-textMuted mt-1">Funciones movidas desde Más para mantenerlo simple. Siguen disponibles aquí.</p>
        <div className="mt-3 space-y-2">
          <button onClick={async()=> downloadBlob(await exportJSON(), `trainpwa-backup-${new Date().toISOString().slice(0,10)}.json`)} className="w-full py-2 rounded-xl bg-bg border border-border text-body">Exportar JSON</button>
          <button onClick={async()=> downloadBlob(await exportCSV(), `trainpwa-sets-${new Date().toISOString().slice(0,10)}.csv`)} className="w-full py-2 rounded-xl bg-bg border border-border text-body">Exportar CSV</button>
          <button onClick={()=>exportPDF()} className="w-full py-2 rounded-xl bg-bg border border-border text-body">Exportar PDF</button>
          <label className="w-full py-2 rounded-xl bg-bg border border-border text-body text-center block cursor-pointer">Importar JSON<input type="file" accept=".json" onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; try{ await importJSON(f); alert('Importado OK')}catch(err:any){alert(err.message)}}} className="hidden"/></label>
          <button onClick={async()=>{
            const today=new Date().toISOString().slice(0,10); const sid=uuid(); await db.sessions.put({id:sid, localDate:today, startedAt:new Date().toISOString(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()}); for(let i=0;i<4;i++) await db.setLogs.put({id:uuid(), sessionId:sid, exerciseId:'ex-001', setNumber:i+1, weight:70+i*2.5, reps:8, completed:true, createdAt:new Date().toISOString()}); alert('Demo cargado')
          }} className="w-full py-2 rounded-xl bg-action text-textMain">Cargar demo</button>
          <button onClick={async()=>{ await db.setLogs.clear(); await db.sessions.clear(); localStorage.removeItem('syncQueue'); alert('Demo eliminado')}} className="w-full py-2 rounded-xl bg-surface border border-border text-body">Eliminar demo</button>
          <button onClick={async()=>{ const ok=await Push.sendNotification('seguimiento','Train PWA','¿Cómo venís con agua?'); if(!ok) alert('Límite 2/día o permiso denegado') }} className="w-full py-2 rounded-xl bg-action text-textMain">Probar notificación</button>
          <button onClick={async()=>{ const r=await Sync.syncNow(); alert(`Sync ${r.synced}`)}} className="w-full py-2 rounded-xl bg-bg border border-border text-body">Sincronizar ahora</button>
          <Link to="/onboarding" className="text-aux text-info underline block text-center">Reconfigurar Coach / Ciclo</Link>
        </div>
      </details>
    </div>
  )
}
