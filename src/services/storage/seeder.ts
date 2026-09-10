import { db } from './db'
import { v4 as uuid } from 'uuid'

// Seeder coherente — 4 semanas, 3 días/semana, progresión, sin estados vacíos
export async function seedCoherentHistory(){
  const today = new Date()
  const userId = 'me'
  // Perfil ya existe via Onboarding, no lo toca

  // Limpia previo demo si existe
  // No borra perfil

  const routineId = 'seed-rutina-1'
  await db.routines.put({ id: routineId, name: 'Hipertrofia Seed', createdAt: new Date(Date.now()-28*86400000).toISOString(), updatedAt: new Date().toISOString() } as any)

  // 4 semanas × 3 sesiones = 12 sesiones
  for(let w=0; w<4; w++){
    for(let d=0; d<3; d++){
      const date = new Date(today)
      date.setDate(today.getDate() - (4-w)*7 + d*2)
      const iso = date.toISOString().slice(0,10)
      const sessionId = uuid()
      await db.sessions.put({
        id: sessionId,
        routineId,
        localDate: iso,
        startedAt: new Date(date.setHours(18,0,0,0)).toISOString(),
        finishedAt: new Date(date.setHours(19,0,0,0)).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any)

      // 3 ejercicios por sesión, 4 series c/u, progresión +2.5kg por semana
      const exs = [
        { id: 'pectorals/barbell-bench-press', base: 70 },
        { id: 'pectorals/barbell-incline-bench-press', base: 60 },
        { id: 'triceps/cable-pushdown', base: 35 },
      ]
      for(let ei=0; ei<exs.length; ei++){
        const ex = exs[ei]
        for(let s=1; s<=4; s++){
          const weight = ex.base + w*2.5 + (Math.random()*2 -1)
          const reps = 8 - (w>2 ? 1 : 0) + Math.floor(Math.random()*2)
          await db.setLogs.put({
            id: uuid(),
            sessionId,
            exerciseId: ex.id,
            setNumber: s,
            weight: Math.round(weight/5)*5, // múltiplo 5
            reps,
            completed: true,
            createdAt: new Date(date).toISOString()
          } as any)
        }
      }

      // Recovery e hidratación ese día
      await db.recoveryChecks.put({
        id: iso,
        localDate: iso,
        energy: 7 + Math.floor(Math.random()*3),
        fatigue: 3 + Math.floor(Math.random()*3),
        stress: 3 + Math.floor(Math.random()*2),
        sleepHours: 7 + Math.random(),
        sleepQuality: 7 + Math.floor(Math.random()*2),
        soreness: 3 + Math.floor(Math.random()*2),
        motivation: 7 + Math.floor(Math.random()*2),
        digestion: 7,
        hydration: 7 + Math.floor(Math.random()*2),
        score: 75 + Math.floor(Math.random()*10),
        color: 'green'
      } as any).catch(()=>{})

      await db.hydrationLogs.put({
        id: uuid(),
        localDate: iso,
        amountMl: 2000 + Math.floor(Math.random()*500),
        time: new Date().toISOString()
      } as any)
    }
  }

  // Body measurements evolución
  for(let i=0;i<4;i++){
    const d=new Date(today); d.setDate(today.getDate()- (3-i)*7)
    await db.table('bodyMeasurements').put({
      id: uuid(),
      localDate: d.toISOString().slice(0,10),
      weightKg: 80 - i*0.5,
      heightCm: 175,
      bodyFatPct: 18 - i*0.3,
      createdAt: new Date().toISOString()
    }).catch(()=>{})
  }

  // Marca seed realizado
  localStorage.setItem('seed:done', new Date().toISOString())
}

export async function wipeDatabase(){
  // Borrado permanente — único comando, agnóstico
  await db.sessions.clear()
  await db.setLogs.clear()
  await db.recoveryChecks.clear()
  await db.hydrationLogs.clear()
  await db.routines.clear()
  await db.routineDays.clear()
  await db.routineExercises.clear()
  try{ await db.table('bodyMeasurements').clear()}catch{}
  try{ await db.table('coachMemory').clear()}catch{}
  try{ await db.table('weeklySequences').clear()}catch{}
  try{ await db.table('trainingSessions').clear()}catch{}
  try{ await db.table('exerciseRecords').clear()}catch{}
  try{ await db.table('customExercises').clear()}catch{}
  for(const t of ['sessionExercises','setRecords','sessionEvents','postWorkoutSurveys','negativeSets','exerciseObservations']){
    try{ await db.table(t).clear()}catch{ /* noop */ }
  }
  // localStorage claves de sesión/historial (no borra perfil)
  const keep = ['onboard:nombre','onboard:email','onboard:altura','onboard:peso']
  const toRemove:string[] = []
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i)
    if(k && !keep.includes(k) && (k.startsWith('session:') || k.startsWith('althea:session') || k.startsWith('althea:migration') || k.startsWith('althea:result:') || k.startsWith('exstate:') || k.startsWith('neg:') || k.startsWith('obs:') || k.startsWith('observation:') || k.startsWith('nutri:diario:') || k.startsWith('coachMemory') || k.startsWith('seed:') || k.startsWith('hydration:') || k.startsWith('post:') || k.startsWith('rec:') || k.startsWith('rutinas:') || k.startsWith('rutina:')))
      toRemove.push(k)
  }
  toRemove.forEach(k=> localStorage.removeItem(k))
}

// Backend endpoint equivalente (si hubiera backend Node/Express)
// DELETE /api/admin/wipe
// export async function DELETE(req,res){
//   if(req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({error:'unauthorized'})
//   await wipeDatabase()
//   res.json({ok:true, wipedAt: new Date().toISOString()})
// }
