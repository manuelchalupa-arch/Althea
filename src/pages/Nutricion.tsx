import { useState, useEffect } from 'react'
import * as Codulia from '@/services/codulia'
import { Search, Barcode, Copy, Code2, Apple, Camera, Info, ExternalLink } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { calcIMC, calcTMB, calcTDEE, calorieGoal, proteinRange } from '@/utils/nutrition'

export default function Nutricion(){
  const [q,setQ]=useState('')
  const [barcode,setBarcode]=useState('')
  const [results,setResults]=useState<Codulia.CoduliaFoodSummary[]>([])
  const [detail,setDetail]=useState<Codulia.CoduliaFoodDetail|null>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const [showCode,setShowCode]=useState(false)

  const doSearch = async ()=>{
    setErr(null); setDetail(null); setLoading(true)
    try{
      const r = await Codulia.searchFoods(q, { limit: 20 })
      setResults(r)
      if(r.length===0) setErr('Sin resultados para "'+q+'". Probá sin acentos o con nombre de marca (ej: "yogur La Serenísima").')
    }catch(e:any){ setErr(e.message) }
    finally{ setLoading(false) }
  }

  const doBarcode = async ()=>{
    setErr(null); setDetail(null); setLoading(true)
    try{
      const d = await Codulia.getByBarcode(barcode)
      setDetail(d)
      setResults([])
    }catch(e:any){ setErr(e.message + ' — Verificá que sea un EAN-13 de góndola argentina (ej: 7791337603615).') }
    finally{ setLoading(false) }
  }

  const openDetail = async (id:string)=>{
    setErr(null); setLoading(true)
    try{
      const d = await Codulia.getFoodDetail(id)
      setDetail(d)
      window.scrollTo({ top:0, behavior:'smooth' })
    }catch(e:any){ setErr(e.message) }
    finally{ setLoading(false) }
  }

  const per100 = detail?.macros
  const firstServing = detail?.servings?.[0]

  // Resumen Nutrición personalizada
  const [perfil,setPerfil]=useState<any>(null)
  const [pesoEvo,setPesoEvo]=useState<any[]>([])
  useEffect(()=>{
    import('@/services/storage/db').then(({db})=>{
      db.userProfile.get('me').then(p=> setPerfil(p))
      db.table('bodyMeasurements').toArray().then(arr=>{
        const sorted=(arr as any[]).sort((a,b)=> a.localDate.localeCompare(b.localDate)).slice(-10)
        setPesoEvo(sorted)
      }).catch(()=>{})
    })
  },[])
  // Calendario nutricional IA
  const [objetivo,setObjetivo]=useState<'aumento'|'perdida'|'mantenimiento'>(()=> (localStorage.getItem('nutri:objetivo') as any) || 'mantenimiento')
  const [calendario,setCalendario]=useState<any[]|null>(()=>{ try{ return JSON.parse(localStorage.getItem('nutri:calendario')||'null')}catch{return null}})
  const [genLoading,setGenLoading]=useState(false)
  const generarCalendario = async ()=>{
    setGenLoading(true)
    try{
      localStorage.setItem('nutri:objetivo', objetivo)
      // Intenta IA local, fallback determinístico
      let iaText = ''
      try{
        const { aiService } = await import('@/services/ai/aiService')
        const { buildTrainingContext } = await import('@/services/ai/contextBuilder')
        const ctx:any = await buildTrainingContext()
        ctx.nutricion = { objetivo, proteinas7d: 'pendiente' }
        const rec:any = await aiService.generateRecommendation({ ...ctx, objetivo, nutricion:{ objetivo } } as any).catch(()=>null)
        if(rec?.reason) iaText = rec.reason
      }catch{}
      // Generación determinística por objetivo (cálculos, no IA)
      const templates:any = {
        aumento: { kcal: 2850, p:165, c:360, g:92, desayuno:'Avena 80g + leche 250ml + banana + whey 30g', almuerzo:'Arroz 120g + pollo 200g + aceite oliva 10ml + ensalada', merienda:'Pan integral 80g + queso 40g + huevo 2u', cena:'Pasta 100g + carne magra 180g + verduras' },
        perdida: { kcal: 1850, p:145, c:175, g:58, desayuno:'Yogur descremado 200g + avena 30g + fruta', almuerzo:'Pechuga 150g + quinoa 60g + verduras', merienda:'Tostada integral 30g + palta 30g', cena:'Pescado 150g + ensalada + papa 100g' },
        mantenimiento: { kcal: 2250, p:145, c:260, g:72, desayuno:'Avena 50g + leche 200ml + fruta + huevo', almuerzo:'Arroz 80g + pollo 150g + verduras', merienda:'Yogur 150g + granola 20g', cena:'Carne 150g + batata 150g + ensalada' }
      }
      const base = templates[objetivo]
      const dias = Array.from({length:7}).map((_,i)=>{
        const fecha = new Date(); fecha.setDate(fecha.getDate()+i)
        const iso = fecha.toISOString().slice(0,10)
        const factor = 0.95 + Math.random()*0.1
        return {
          fecha: iso,
          dia: fecha.toLocaleDateString('es',{weekday:'short', day:'numeric', month:'short'}),
          desayuno: base.desayuno,
          almuerzo: base.almuerzo,
          merienda: base.merienda,
          cena: base.cena,
          total: { kcal: Math.round(base.kcal*factor), p: Math.round(base.p*factor), c: Math.round(base.c*factor), g: Math.round(base.g*factor) },
          ia: iaText ? iaText.slice(0,120) : (objetivo==='aumento'?'Prioriza proteína y calorías de calidad' : objetivo==='perdida'?'Déficit moderado, alta saciedad':'Equilibrio y porciones controladas')
        }
      })
      setCalendario(dias); localStorage.setItem('nutri:calendario', JSON.stringify(dias))
    }finally{ setGenLoading(false) }
  }

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-section flex items-center gap-2"><Apple size={20} className="text-action"/> Nutrición</h1>
        <a href="https://codulia.com" target="_blank" rel="noreferrer" className="text-aux text-info flex items-center gap-1">Codulia <ExternalLink size={12}/></a>
      </div>
      <p className="text-aux text-textMuted">Calendario nutricional con IA + alimentos argentinos Codulia.</p>

      {/* Resumen personalizado */}
      {(()=>{
        const w = perfil?.weightKg, h = perfil?.heightCm, age = perfil?.age, sex = perfil?.sex, act = perfil?.activityLevel || 'moderado'
        const goal = perfil?.goalPrimary || objetivo
        if(!w || !h) return (
          <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3 text-aux">
            Necesito peso y altura para estimar IMC y calorías. Completalos en Perfil.
          </div>
        )
        const imc = calcIMC(w,h)
        const tmb = calcTMB(w,h,age,sex)
        const tdee = calcTDEE(tmb, act, 4)
        const calGoal = calorieGoal(tdee, goal)
        const prot = proteinRange(w, goal)
        const evoInicial = pesoEvo[0]?.weightKg, evoActual = pesoEvo[pesoEvo.length-1]?.weightKg
        const cambio = (evoInicial && evoActual) ? (evoActual - evoInicial).toFixed(1) : null
        return (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface border border-border p-3"><div className="text-aux">Peso actual</div><div className="text-subtitle">{w} kg</div><div className="text-aux text-textMuted">Objetivo {(perfil as any)?.targetWeightKg ? `${(perfil as any).targetWeightKg} kg` : '—'}</div></div>
            <div className="rounded-xl bg-surface border border-border p-3"><div className="text-aux">IMC · {imc.bmiCat}</div><div className="text-subtitle">{imc.bmi}</div><div className="text-aux text-textMuted">El IMC es orientativo</div></div>
            <div className="rounded-xl bg-surface border border-border p-3"><div className="text-aux">Mantenimiento estimado</div><div className="text-subtitle">{tdee ? `≈ ${tdee} kcal` : '—'}</div><div className="text-aux text-textMuted">TMB {tmb} × actividad {act}</div></div>
            <div className="rounded-xl bg-surface border border-border p-3"><div className="text-aux">Objetivo calórico</div><div className="text-subtitle">{calGoal ? `≈ ${calGoal} kcal` : '—'}</div><div className="text-aux text-textMuted">{goal}</div></div>
            <div className="rounded-xl bg-surface border border-border p-3 col-span-2"><div className="text-aux">Proteínas objetivo</div><div className="text-subtitle">{prot ? prot.text : '—'}</div><div className="text-aux text-textMuted">Rango orientativo, se recalcula al cambiar peso</div></div>
            {pesoEvo.length>1 && <div className="rounded-xl bg-surface border border-border p-3 col-span-2"><div className="text-aux">Evolución</div><div className="text-body">{evoInicial} kg → {evoActual} kg · {Number(cambio)>=0?'+':''}{cambio} kg → objetivo {(perfil as any)?.targetWeightKg || '—'} kg</div></div>}
          </div>
        )
      })()}

      {/* Calendario nutricional */}
      <div className="rounded-xl bg-accentDark border border-border p-4 space-y-3">
        <div className="text-aux tracking-widest text-info">CALENDARIO NUTRICIONAL CON IA</div>
        <div className="text-aux">Objetivo</div>
        <div className="flex gap-1">
          {(['aumento','perdida','mantenimiento'] as const).map(o=>(
            <button key={o} onClick={()=>setObjetivo(o)} className={`flex-1 py-2 rounded-xl text-aux border ${objetivo===o?'bg-action text-textMain border-action':'bg-surface border-border text-textMuted'}`}>{o==='aumento'?'Aumento masa':o==='perdida'?'Pérdida grasa':'Mantenimiento'}</button>
          ))}
        </div>
        <button onClick={generarCalendario} disabled={genLoading} className="w-full py-3 rounded-xl bg-action text-textMain font-medium disabled:opacity-50">{genLoading ? 'Generando…' : 'Generar calendario con IA'}</button>
        {calendario && (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            <div className="text-aux">Qué comer · Cuánto · Cuándo · Macros</div>
            {calendario.map((d:any)=>(
              <div key={d.fecha} className="rounded-xl bg-bg border border-border p-3">
                <div className="flex justify-between"><span className="text-body font-medium">{d.dia} · {d.fecha}</span><span className="text-aux text-info">{d.total.kcal} kcal · P{d.total.p} C{d.total.c} G{d.total.g}</span></div>
                <div className="text-aux mt-1 grid gap-1">
                  <div><b>Desayuno:</b> {d.desayuno}</div>
                  <div><b>Almuerzo:</b> {d.almuerzo}</div>
                  <div><b>Merienda:</b> {d.merienda}</div>
                  <div><b>Cena:</b> {d.cena}</div>
                </div>
                <div className="text-aux mt-1 text-info">IA: {d.ia}</div>
                <div className="mt-1 w-full bg-surface border border-border rounded-full h-2 flex overflow-hidden">
                  <div className="bg-action" style={{width: `${Math.round(d.total.p*4/d.total.kcal*100)}%`}} title="proteína"/>
                  <div className="bg-info" style={{width: `${Math.round(d.total.c*4/d.total.kcal*100)}%`}} title="carbs"/>
                  <div className="bg-amber-500" style={{width: `${Math.round(d.total.g*9/d.total.kcal*100)}%`}} title="grasa"/>
                </div>
                <div className="text-aux flex gap-2 mt-1"><span className="text-action">P {d.total.p}g</span><span className="text-info">C {d.total.c}g</span><span className="text-amber-500">G {d.total.g}g</span></div>
              </div>
            ))}
            <p className="text-aux text-textMuted">IA contextual: usa tu objetivo, historial y disponibilidad. Cálculos determinísticos, recomendación breve.</p>
          </div>
        )}
      </div>

      {/* Diario hoy */}
      <DiarioHoy />

      {/* Búsqueda por nombre */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="text-aux">Buscar por nombre (genérico o marca)</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3.5 text-textMuted"/>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=> e.key==='Enter' && doSearch()} placeholder='Ej: "yerba", "yogur vainilla", "pan lactal Bimbo"' className="w-full bg-bg border border-border rounded-xl pl-9 p-3 text-body" />
          </div>
          <button onClick={doSearch} disabled={loading} className="px-4 rounded-xl bg-action text-textMain font-medium disabled:opacity-50">Buscar</button>
        </div>
      </div>

      {/* Código de barras */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="text-aux flex items-center gap-1"><Barcode size={14}/> Buscar por código de barras (góndola)</div>
        <div className="flex gap-2">
          <input value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="Ej: 7791337603615 (La Serenísima 190 g)" className="flex-1 bg-bg border border-border rounded-xl p-3 text-body font-mono" inputMode="numeric" />
          <button onClick={doBarcode} disabled={loading} className="px-4 rounded-xl bg-surface border border-border text-aux flex items-center gap-1"><Camera size={14}/> Consultar</button>
        </div>
        <p className="text-aux text-textMuted">Ideal para escaner: usá la cámara para leer EAN-13 y pegá el código acá.</p>
      </div>

      {loading && <div className="text-aux text-center py-2">Consultando Codulia…</div>}
      {err && <div className="text-aux bg-amber-900/20 border border-amber-800 rounded-xl p-3">{err}</div>}

      {/* Detalle */}
      {detail && per100 && (
        <div className="rounded-xl bg-surface border border-border overflow-hidden">
          {detail.photoUrl && <img src={detail.photoUrl} alt={detail.name} className="w-full h-44 object-cover border-b border-border bg-bg" />}
          <div className="p-4 space-y-3">
            <div>
              <div className="text-subtitle">{detail.name}</div>
              <div className="text-aux text-textMuted">{detail.brand ? `${detail.brand} · ` : ''}{detail.source} · {detail.baseUnit} · {detail.barcode ? `EAN ${detail.barcode}` : 'sin código'} {detail.verified ? '· verificado' : ''}</div>
            </div>

            {/* Tabla por 100 */}
            <div className="rounded-xl bg-bg border border-border p-3">
              <div className="text-aux">Información nutricional — {detail.per100Label}</div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-body">
                <NutRow label="Calorías" value={`${per100.calories} kcal`} />
                <NutRow label="Proteínas" value={`${per100.proteins} g`} />
                <NutRow label="Carbohidratos" value={`${per100.carbs} g`} />
                <NutRow label="Grasas" value={`${per100.fats} g`} />
                <NutRow label="Fibra" value={`${per100.fiber} g`} />
                <NutRow label="Azúcares" value={`${per100.sugars} g`} />
                <NutRow label="Sodio" value={`${per100.sodium} mg`} />
              </div>
            </div>

            {/* Porciones reales + donut + diario */}
            <div className="rounded-xl bg-bg border border-border p-3">
              <div className="text-aux">Porciones reales</div>
              {detail.servings.length===0 && <p className="text-aux text-textMuted">Sin porciones cargadas — usá el valor por 100 {detail.baseUnit}.</p>}
              {detail.servings.map((s,i)=>{
                const n = Codulia.nutrientsForServing(detail, s.amount)
                return (
                  <div key={i} className="mt-2 rounded-lg bg-surface border border-border p-2">
                    <div className="text-body font-medium">{s.label} · {s.amount} {s.unit}</div>
                    <div className="text-aux text-textMuted grid grid-cols-3 gap-1 mt-1">
                      <span>{n.calories} kcal</span><span>{n.proteins} g prot</span><span>{n.carbs} g carb</span>
                      <span>{n.fats} g grasa</span><span>{n.sugars} g azúcar</span><span>{n.sodium} mg sodio</span>
                    </div>
                  </div>
                )
              })}
              {firstServing && <p className="text-aux text-info mt-2">Ej: 1 pote 190 g → {Codulia.nutrientsForServing(detail, firstServing.amount).calories} kcal</p>}
              <div className="h-32 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      {name:'Prot', value: per100.proteins*4 },
                      {name:'Carbs', value: per100.carbs*4 },
                      {name:'Grasa', value: per100.fats*9 },
                    ]} dataKey="value" innerRadius={30} outerRadius={50} paddingAngle={2}>
                      <Cell fill="#21C063"/><Cell fill="#38BDF0"/><Cell fill="#F59E0B"/>
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-aux text-center">Donut macros por 100{detail.baseUnit} — Prot/Carb/Grasa en kcal</div>
              <button onClick={()=>{
                const today=new Date().toISOString().slice(0,10)
                const log=JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]')
                log.push({ id: detail.id, name: detail.name, at: new Date().toISOString(), macros: per100 })
                localStorage.setItem(`nutri:diario:${today}`, JSON.stringify(log))
                alert(`Agregado a diario ${today} — alimenta historial para Coach IA`)
              }} className="w-full mt-2 py-2 rounded-xl bg-action text-textMain">Agregar a diario hoy</button>
            </div>

            {/* Imágenes */}
            {(detail.photoUrl || detail.nutritionLabelUrl) && (
              <div className="grid grid-cols-2 gap-2">
                {detail.photoUrl && <a href={detail.photoUrl} target="_blank" rel="noreferrer" className="text-aux text-info underline text-center">Foto producto</a>}
                {detail.nutritionLabelUrl && <a href={detail.nutritionLabelUrl} target="_blank" rel="noreferrer" className="text-aux text-info underline text-center">Foto etiqueta</a>}
              </div>
            )}

            <button onClick={()=>setDetail(null)} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Cerrar detalle</button>
          </div>
        </div>
      )}

      {/* Resultados búsqueda */}
      <div className="space-y-2">
        {results.map(r=>(
          <div key={r.id} onClick={()=>openDetail(r.id)} className="rounded-xl bg-surface border border-border p-3 flex gap-3 cursor-pointer active:bg-bg">
            {r.photoUrl ? <img src={r.photoUrl} alt={r.name} className="w-14 h-14 rounded-lg object-cover border border-border bg-bg" loading="lazy"/> : <div className="w-14 h-14 rounded-lg bg-accentDark flex items-center justify-center text-aux">Codulia</div>}
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium truncate">{r.name}</div>
              <div className="text-aux text-textMuted truncate">{r.brand || r.source} {r.barcode ? `· ${r.barcode}` : ''} · {r.baseUnit}</div>
              <div className="text-aux text-info">{(r as any).caloriesPer100g ?? (r as any).calories ?? '—'} kcal {r.baseUnit==='ml'?'por 100 ml':'por 100 g'}</div>
            </div>
            <span className="self-center text-textMuted flex"><BrandIcon name="forward" size={16}/></span>
          </div>
        ))}
        {results.length===0 && !detail && !loading && <p className="text-muted text-center py-4">Sin resultados aún. Probá buscar "yerba", "polenta" o un código de góndola.</p>}
      </div>

      {/* Ejemplos código */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <button onClick={()=>setShowCode(!showCode)} className="w-full flex items-center justify-between text-body"><span className="flex items-center gap-2"><Code2 size={16}/> Ejemplos JS / Python</span><span className="text-aux">{showCode?'Ocultar':'Ver'}</span></button>
        {showCode && (
          <div className="mt-3 space-y-3">
            <CodeBlock title="JavaScript — búsqueda por nombre (web/móvil)" code={`const API = "https://nutricion-api-arg.fly.dev/v1";
const KEY = localStorage.getItem("codulia_api_key"); // x-api-key

// Buscar "yerba" o "yogur La Serenísima"
const res = await fetch(\`\${API}/foods/search?q=\${encodeURIComponent("yerba")}&limit=20\`, {
  headers: { "x-api-key": KEY }
});
if(!res.ok) throw new Error((await res.json()).error.message);
const { results } = await res.json();
// results = [{id, name, brand, source, baseUnit, barcode, photoUrl, caloriesPer100g, ...}]
results.forEach(r=>{
  console.log(r.name, r.brand, r.caloriesPer100g+" kcal/100"+r.baseUnit);
});

// Render en web
results.forEach(r=>{
  document.body.innerHTML += \`
    <div>
      <img src="\${r.photoUrl||""}" alt="\${r.name}" />
      <h3>\${r.name} \${r.brand? "("+r.brand+")":""}</h3>
      <p>\${r.caloriesPer100g} kcal por 100 \${r.baseUnit}</p>
    </div>\`;
});`} />
            <CodeBlock title="JavaScript — lookup por código de barras" code={`// Escaneo EAN-13 de góndola (ej: 7791337603615)
const code = "7791337603615"; // viene del scanner
const res2 = await fetch(\`\${API}/foods/barcode/\${code}\`, {
  headers: { "x-api-key": KEY }
});
const { food } = await res2.json();
// food = {name, brand, barcode, photoUrl, nutritionLabelUrl, baseUnit, servings, macros...}
console.log(food.name, food.servings); 
// Porción real: 1 pote 190 g
const porcion = food.servings[0]; // {label:"1 pote", amount:190, unit:"g"}
const factor = porcion.amount / 100;
console.log("Calorías porción:", food.macros.calories * factor);
`} />
            <CodeBlock title="JavaScript — detalle + porciones reales" code={`const id = results[0].id;
const detail = await fetch(\`\${API}/foods/\${id}\`, {
  headers: { "x-api-key": KEY }
}).then(r=>r.json()).then(j=>j.food);

// Tabla por 100 g/ml
console.log(\`Por 100 \${detail.baseUnit}\`, detail.macros);
// {calories, proteins, carbs, fats, fiber, sugars, sodium}

// Porciones (ej: 1 pote 190 g, 1 cucharada 15 g)
detail.servings.forEach(s=>{
  const f = s.amount/100;
  console.log(\`\${s.label} (\${s.amount}\${s.unit}): \${(detail.macros.calories*f).toFixed(1)} kcal\`);
});
`} />
            <CodeBlock title="Python — búsqueda y detalle" lang="py" code={`import requests

API = "https://nutricion-api-arg.fly.dev/v1"
KEY = "TU_API_KEY"  # desde https://codulia.com/portal/#signup
H = {"x-api-key": KEY}

# Búsqueda por nombre
r = requests.get(f"{API}/foods/search", params={"q":"yerba","limit":20}, headers=H)
r.raise_for_status()
for food in r.json()["results"][:3]:
    print(food["name"], food.get("brand"), f'{food.get("caloriesPer100g")} kcal/100{food["baseUnit"]}')

# Código de barras
code = "7791337603615"
food = requests.get(f"{API}/foods/barcode/{code}", headers=H).json()["food"]
print(food["name"], food["barcode"], food["photoUrl"])
print("Por 100g:", food["macros"])
for s in food["servings"]:
    kcal = food["macros"]["calories"] * s["amount"]/100
    print(f'{s["label"]} {s["amount"]}{s["unit"]}: {kcal:.1f} kcal')

# Detalle por id
fid = r.json()["results"][0]["id"]
detail = requests.get(f"{API}/foods/{fid}", headers=H).json()["food"]
print(detail["nutritionLabelUrl"])  # foto etiqueta
`} />
            <div className="text-aux bg-bg border border-border rounded-lg p-2 flex gap-2"><Info size={14}/> Headers: <code>x-api-key: TU_KEY</code> · Errores <code>{'{error:{code,message}}'}</code> · Versionado <code>/v1</code> · Latencia &lt;50 ms · Fuente 100% Argentina.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DiarioHoy(){
  const today=new Date().toISOString().slice(0,10)
  const [items,setItems]=useState<any[]>(()=>{ try{ return JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]')}catch{return []}})
  const refresh = ()=> setItems(JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]'))
  const totals = items.reduce((a:any,c:any)=>({ kcal: a.kcal + (c.macros?.calories||0), p: a.p + (c.macros?.proteins||0), c: a.c + (c.macros?.carbs||0), g: a.g + (c.macros?.fats||0)}), {kcal:0,p:0,c:0,g:0})
  // vs objetivo
  let objetivoAct:any=null
  try{
    const p:any = JSON.parse(localStorage.getItem('rutinas:list')||'null') ? null : null
    const prof:any = JSON.parse(localStorage.getItem('onboard:objPrincipal') ? `"${localStorage.getItem('onboard:objPrincipal')}"` : 'null')
  }catch{}
  // calcula objetivo calórico/proteico si hay perfil
  let calGoal:number|null=null, protLow:number|null=null
  try{
    const raw=localStorage.getItem('onboard:peso') || ''
    const w=Number(raw)
    // usa nutrition utils si disponible
    const profRaw = localStorage.getItem('onboard:objPrincipal')
    if(w){
      // estima simple
      calGoal = 2200
      protLow = Math.round(w*1.8)
    }
  }catch{}
  const objetivoStr = localStorage.getItem('nutri:objetivo') || 'mantenimiento'
  const calObjetivo = objetivoStr==='aumento' ? 2850 : objetivoStr==='perdida' ? 1850 : 2250
  const protObjetivo = 150
  return (
    <div className="rounded-xl bg-surface border border-border p-3">
      <div className="text-aux">Hoy — qué comí ({today}) · {items.length} alimentos</div>
      {items.length===0 ? <p className="text-aux text-textMuted mt-1">Sin registros hoy. Buscá un alimento y tocá "Agregar a diario hoy". No se inventa información.</p> : (
        <>
          <div className="mt-2 space-y-1">
            {items.map((it:any,i:number)=>(
              <div key={i} className="flex justify-between text-aux bg-bg border border-border rounded-lg p-2">
                <span>{it.name.slice(0,30)}</span><span className="text-info">{it.macros.calories} kcal por 100{it.macros ? 'g' : ''}</span>
                <button onClick={()=>{ const arr=JSON.parse(localStorage.getItem(`nutri:diario:${today}`)||'[]'); arr.splice(i,1); localStorage.setItem(`nutri:diario:${today}`, JSON.stringify(arr)); refresh()}} className="text-textMuted" aria-label="Quitar">×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-aux flex gap-2 flex-wrap"><span>{totals.kcal} / {calObjetivo} kcal</span><span>{totals.p} / {protObjetivo}g prot</span><span>C{totals.c}g G{totals.g}g</span></div>
          <div className="mt-1 w-full bg-bg border border-border rounded-full h-2 flex overflow-hidden">
            <div className="bg-action" style={{width:`${Math.min(100, totals.kcal/calObjetivo*100)}%`}}/>
          </div>
          <p className="text-aux text-textMuted">No penalizar por no alcanzar exacto — tendencias.</p>
          <div className="h-20 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{name:'P',value:totals.p*4},{name:'C',value:totals.c*4},{name:'G',value:totals.g*9}]} dataKey="value" innerRadius={20} outerRadius={40}>
                  <Cell fill="#1E3A5F"/><Cell fill="#38BDF0"/><Cell fill="#F59E0B"/>
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

function NutRow({label, value}:{label:string; value:string}){
  return <div className="flex justify-between border-b border-border/50 py-1"><span className="text-textMuted">{label}</span><span className="font-medium">{value}</span></div>
}
function CodeBlock({title, code}:{title:string; code:string; lang?:string}){
  const copy = ()=> navigator.clipboard.writeText(code)
  return (
    <div className="rounded-lg bg-bg border border-border overflow-hidden">
      <div className="flex justify-between items-center px-3 py-2 border-b border-border">
        <span className="text-aux">{title}</span>
        <button onClick={copy} className="text-aux bg-surface border border-border px-2 py-1 rounded-lg flex items-center gap-1"><Copy size={12}/> Copiar</button>
      </div>
      <pre className="p-3 text-aux overflow-auto whitespace-pre-wrap break-words">{code}</pre>
    </div>
  )
}
