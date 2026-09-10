import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Progresos(){
  const [data,setData]=useState<any[]>([])
  const [byMuscle,setByMuscle]=useState<Record<string,any[]>>({})
  const [stats,setStats]=useState({ sesiones:0, volumen:0, pr:'80 kg × 5', cambios:1 })

  const [bodyData,setBodyData]=useState<any[]>([])
  useEffect(()=>{
    Promise.all([
      db.setLogs.toArray(),
      db.table('setRecords').toArray().catch(()=>[]),
      db.exercises.toArray(),
      db.sessions.toArray(),
      db.table('trainingSessions').toArray().catch(()=>[]),
      db.table('bodyMeasurements').toArray().catch(()=>[]),
    ]).then(([legacyLogs, officialRecs, exs, legacySessions, officialSessions, bodies])=>{
      // Unión oficial + legacy (sin duplicar: migración copia con mismo contenido pero distinto id;
      // se unifican por fecha+ejercicio+orden+valores para no contar doble lo migrado).
      const seen = new Set<string>()
      const logs = [
        ...(legacyLogs as any[]).map((l)=> ({ exerciseId: l.exerciseId, weight: l.weight, reps: l.reps, createdAt: l.createdAt })),
        ...(officialRecs as any[]).filter((r)=> r.status==='COMPLETED').map((r)=> ({ exerciseId: r.exerciseId, weight: r.actualWeight, reps: r.actualReps, createdAt: r.completedAt || r.createdAt })),
      ].filter((l)=>{ const k = `${l.exerciseId}|${l.createdAt}|${l.weight}|${l.reps}`; if(seen.has(k)) return false; seen.add(k); return true })
      const sessionIds = new Set<string>([...(legacySessions as any[]).map((s)=> s.id), ...(officialSessions as any[]).map((s)=> s.sessionId || s.id)])
      const sessions = [...sessionIds].map((id)=> ({ id }))
      const byDate: Record<string,number> = {}
      logs.forEach(l=>{ const d=l.createdAt.slice(0,10); byDate[d]=(byDate[d]||0)+l.weight*l.reps })
      setData(Object.entries(byDate).slice(-14).map(([date,volumen])=>({date, volumen})))
      const exMap:Record<string,string> = {}; exs.forEach(e=> exMap[e.id]=e.groupMain)
      const byM:Record<string, any[]> = {}
      logs.forEach(l=>{
        const m = exMap[l.exerciseId] || 'otros'
        if(!byM[m]) byM[m]=[]
        byM[m].push(l)
      })
      const perMuscle:Record<string,any[]> = {}
      Object.entries(byM).forEach(([m, arr])=>{
        const weekly:Record<string,number> = {}
        arr.forEach((l:any)=>{
          const wk = l.createdAt.slice(0,10)
          weekly[wk] = Math.max(weekly[wk]||0, l.weight)
        })
        perMuscle[m] = Object.entries(weekly).slice(-4).map(([date,peso],i)=>({ semana:`S${i+1}`, peso, date }))
      })
      setByMuscle(perMuscle)
      const totalVol = logs.reduce((a,l)=>a+l.weight*l.reps,0)
      const pr = logs.length ? Math.max(...logs.map(l=>l.weight)) : 80
      setStats({ sesiones: sessions.length, volumen: totalVol, pr: `${pr} kg`, cambios: 1 })
      // peso corporal
      const sorted = (bodies as any[]).sort((a,b)=> a.localDate.localeCompare(b.localDate)).slice(-14)
      setBodyData(sorted.map(b=> ({date:b.localDate.slice(5), peso:b.weightKg, grasa:b.bodyFatPct, waistCm:b.waistCm, chestCm:b.chestCm})))
    })
  },[])

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <h1 className="text-section">Progresos</h1>
      <p className="text-aux text-textMuted">Evolución por grupo muscular, volumen y cambios de rutina — datos determinísticos.</p>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Volumen últimos 14 días</div>
        <div className="h-44 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.length?data:[{date:'hoy',volumen:0}]}>
              <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
              <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} />
              <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
              <Line type="monotone" dataKey="volumen" stroke="#21C063" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">Sesiones</div><div className="text-subtitle">{stats.sesiones}</div></div>
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">Volumen total</div><div className="text-subtitle">{stats.volumen} kg</div></div>
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">PR</div><div className="text-subtitle">{stats.pr}</div></div>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Evolución por grupo muscular</div>
        {Object.keys(byMuscle).length===0 && <p className="text-aux text-textMuted mt-2">Sin datos aún — registrá entrenamientos en Inicio.</p>}
        {Object.entries(byMuscle).map(([m, arr])=>(
          <div key={m} className="mt-3 rounded-xl bg-bg border border-border p-3">
            <div className="text-body font-medium uppercase">{m}</div>
            <div className="text-aux">{arr.map((a:any)=> `${a.semana}: ${a.peso}kg`).join(' → ') || 'Sin historial'}</div>
            <div className="h-20 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={arr.length?arr:[{semana:'S1', peso:0}]}>
                  <XAxis dataKey="semana" tick={{fontSize:9}}/>
                  <YAxis tick={{fontSize:9}}/>
                  <Tooltip/>
                  <Line type="monotone" dataKey="peso" stroke="#38BDF0" strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
        <p className="text-aux text-textMuted mt-2">Ejemplo: PECHO Sem1 70kg → Sem4 77.5kg — separación por grupo para análisis individual.</p>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Peso corporal y composición</div>
        {bodyData.length===0 ? <p className="text-aux text-textMuted mt-1">Sin registros — cargá peso en Perfil. No se inventa información.</p> : (
          <>
            <div className="h-32 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bodyData}>
                  <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}}/>
                  <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} domain={['dataMin-1','dataMax+1']}/>
                  <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                  <Line type="monotone" dataKey="peso" stroke="#38BDF0" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-aux">
              Último: {bodyData[bodyData.length-1].peso} kg · Grasa {bodyData[bodyData.length-1].grasa||'—'}% · Cintura {(bodyData[bodyData.length-1] as any).waistCm||'—'} cm · Pecho {(bodyData[bodyData.length-1] as any).chestCm||'—'} cm
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Historial y cambios de rutina</div>
        <p className="text-body mt-1">Rutina actual: {(():any=>{ try{ return JSON.parse(localStorage.getItem('rutina:meta')||'null')?.name || 'Rutina 1'}catch{return 'Rutina 1'}})()} · {stats.cambios} cambio registrado · frecuencia {stats.sesiones} sesiones</p>
      </div>
    </div>
  )
}
