import { useState } from 'react'
import { BODY_PARTS } from '@/services/exerciseGym'
import {
  createCustomExercise, updateCustomExercise, fileToExerciseImage,
  type CustomExercise, type CustomInput,
} from '@/services/training/customExercises'
import BrandIcon from '@/components/brand/BrandIcon'

// Formulario de ejercicio personalizado (§32): bloques compactos + previsualización.
// Catálogos (músculos, equipos, categorías, partes) vienen por props desde Biblioteca:
// misma taxonomía, sin paralelos.
export default function BibliotecaCustomForm({
  initial, muscles, equipment, categories, onSaved, onClose,
}: {
  initial?: CustomExercise | null
  muscles: string[]
  equipment: string[]
  categories: string[]
  onSaved: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [bodyPart, setBodyPart] = useState(initial?.bodyPart || 'chest')
  const [muscle, setMuscle] = useState(initial?.muscle || '')
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(initial?.secondaryMuscles || [])
  const [primaryPct, setPrimaryPct] = useState<number>(initial?.muscleBreakdown?.[0]?.pct ?? 70)
  const [secondaryPcts, setSecondaryPcts] = useState<number[]>(initial?.muscleBreakdown?.slice(1).map((s) => s.pct) || [])
  const [category, setCategory] = useState(initial?.category || 'strength')
  const [equip, setEquip] = useState(initial?.equipment || '')
  const [machine, setMachine] = useState(initial?.machine || '')
  const [image, setImage] = useState<string | undefined>(initial?.imageDataUrl)
  const [gifUrl, setGifUrl] = useState(initial?.gifUrl || '')
  const [imgErr, setImgErr] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleSec = (m: string) => {
    if (secondaryMuscles.includes(m)) {
      const i = secondaryMuscles.indexOf(m)
      setSecondaryMuscles(secondaryMuscles.filter((x) => x !== m))
      setSecondaryPcts(secondaryPcts.filter((_, j) => j !== i))
    } else {
      setSecondaryMuscles([...secondaryMuscles, m])
      setSecondaryPcts([...secondaryPcts, 0])
    }
  }
  const sum = primaryPct + secondaryPcts.reduce((a, b) => a + (Number(b) || 0), 0)

  const collect = (): CustomInput => ({
    name, description, bodyPart, muscle, secondaryMuscles,
    primaryPct: Number(primaryPct) || 0,
    secondaryPcts: secondaryMuscles.map((_, i) => Number(secondaryPcts[i]) || 0),
    category, equipment: equip, machine,
    imageDataUrl: image, gifUrl: gifUrl.trim() || undefined,
  })

  const onPreview = async () => {
    const { validateCustomInput } = await import('@/services/training/customExercises')
    const errs = validateCustomInput(collect())
    setErrors(errs)
    if (errs.length === 0) setStep('preview')
  }
  const onSave = async () => {
    setSaving(true)
    try {
      if (initial) await updateCustomExercise(initial.id, collect())
      else await createCustomExercise(collect())
      onSaved()
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : 'No se pudo guardar'])
      setStep('form')
    } finally {
      setSaving(false)
    }
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setImgErr('')
    try {
      setImage(await fileToExerciseImage(f))
    } catch {
      setImgErr('No se pudo leer la imagen')
    }
  }

  const previewBreakdown = [
    { name: muscle || '—', pct: primaryPct, role: 'Principal' as const },
    ...secondaryMuscles.map((m, i) => ({ name: m, pct: secondaryPcts[i] || 0, role: 'Secundario' as const })),
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-2" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-surface-container-low/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[92vh] overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">{initial ? 'Editar ejercicio' : '+ Agregar ejercicio'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button>
        </div>

        {step === 'form' ? (
          <>
            <section className="space-y-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Información básica</div>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Press unilateral en polea" maxLength={80} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" /></label>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Descripción<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} placeholder="Opcional" className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" /></label>
            </section>

            <section className="space-y-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Clasificación (mismo catálogo de Biblioteca)</div>
              {muscles.length===0 && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-error-text">Sin conexión: no se pudo cargar el catálogo. Reintentá con internet para clasificar.</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Parte *
                  <select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
                    {BODY_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculo principal *
                  <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
                    <option value="">Seleccionar…</option>
                    {muscles.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Tipo de movimiento
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Equipo
                  <select value={equip} onChange={(e) => setEquip(e.target.value)} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
                    <option value="">Seleccionar…</option>
                    {equipment.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Máquina específica (opcional)<input value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="Ej: Press de pecho Hammer" maxLength={80} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" /></label>
            </section>

            <section className="space-y-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Activación muscular (debe sumar 100%)</div>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Principal: {muscle || '—'} — %
                <input type="number" min={0} max={100} value={primaryPct} onChange={(e) => setPrimaryPct(Number(e.target.value))} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
              </label>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculos secundarios (tocá para agregar/quitar)</div>
              <div className="flex gap-1 flex-wrap max-h-28 overflow-auto">
                {muscles.filter((m) => m !== muscle).map((m) => (
                  <button key={m} onClick={() => toggleSec(m)} className={`px-2 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${secondaryMuscles.includes(m) ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface border-outline-variant text-on-surface-variant'}`}>{m}</button>
                ))}
              </div>
              {secondaryMuscles.map((m, i) => (
                <label key={m} className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-2">{m} — %
                  <input type="number" min={0} max={100} value={secondaryPcts[i] ?? 0} onChange={(e) => { const nx = [...secondaryPcts]; nx[i] = Number(e.target.value); setSecondaryPcts(nx) }} className="flex-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
                </label>
              ))}
              <p className={`font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${Math.abs(sum - 100) > 0.001 ? 'st-error-text' : 'st-success-text'}`}>Suma actual: {Math.round(sum * 10) / 10}% (requerido: 100%)</p>
            </section>

            <section className="space-y-2">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Multimedia (opcional)</div>
              {image ? (
                <div className="flex items-center gap-2">
                  <img src={image} alt="previsualización" className="w-20 h-20 rounded object-contain bg-surface/60 border border-outline-variant" />
                  <div className="flex gap-2">
                    <label className="px-3 py-2 rounded bg-surface border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant cursor-pointer">Reemplazar<input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
                    <button onClick={() => setImage(undefined)} className="px-3 py-2 rounded bg-surface border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Eliminar</button>
                  </div>
                </div>
              ) : (
                <label className="block w-full py-3 rounded bg-surface border border-dashed border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center cursor-pointer">Agregar imagen<input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
              )}
              {imgErr && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-error-text">{imgErr}</p>}
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">GIF URL (opcional, si no hay imagen se usa como visual)
                <input value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} placeholder="https://…" maxLength={500} className="w-full mt-1 bg-surface border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
              </label>
            </section>

            {errors.length > 0 && (
              <div className="rounded border border-danger/40 bg-danger/10 p-2">
                {errors.map((e) => <p key={e} className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-error-text">{e}</p>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-3 rounded bg-surface border border-outline-variant font-body-md text-sm text-on-surface">Cancelar</button>
              <button onClick={onPreview} className="flex-1 py-3 rounded bg-primary text-on-surface font-medium">Previsualizar</button>
            </div>
          </>
        ) : (
          <>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">PREVISUALIZACIÓN</div>
            <div className="rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant overflow-hidden">
              <div className="relative w-full aspect-[4/3] bg-surface/60 border-b border-outline-variant flex items-center justify-center">
                {(image || gifUrl) ? <img src={image || gifUrl} alt={name} className="relative w-full h-full object-contain" /> : <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sin imagen</span>}
              </div>
              <div className="p-3">
                <div className="font-body-md text-sm text-on-surface font-medium">{name || 'Sin nombre'}</div>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">{bodyPart} · {muscle || '—'} · {equip || '—'}</div>
                <div className="mt-2 space-y-1">
                  {previewBreakdown.map((m) => (
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="flex-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{m.name} <span className="text-on-surface-variant">· {m.role}</span></span>
                      <span className="font-body-md text-sm text-on-surface font-medium">{m.pct}%</span>
                      <div className="w-20 h-2 bg-surface/60 border border-outline-variant rounded-full overflow-hidden"><div className={`h-full ${m.role === 'Principal' ? 'bg-primary' : 'bg-info'}`} style={{ width: `${Math.max(0, Math.min(100, m.pct))}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {errors.length > 0 && (
              <div className="rounded border border-danger/40 bg-danger/10 p-2">
                {errors.map((e) => <p key={e} className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-error-text">{e}</p>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep('form')} className="flex-1 py-3 rounded bg-surface border border-outline-variant font-body-md text-sm text-on-surface">Volver</button>
              <button onClick={onSave} disabled={saving} className="flex-1 py-3 rounded bg-primary text-on-surface font-medium disabled:opacity-50">{saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Guardar ejercicio'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
