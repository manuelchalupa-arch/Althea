import { useState, useEffect, useCallback } from 'react'
import { db } from '@/services/storage/db'
import { 
  Calendar, Plus, Minus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, 
  AlertTriangle, AlertCircle, CheckCircle, Clock, Calendar as CalendarIcon,
  HelpCircle, XCircle, Lightbulb, Brain, Zap, Target, TrendingUp, TrendingDown
} from 'lucide-react'
import { AltheaButton, AltheaCard, AltheaInput, AltheaSelect } from '@/components/althea'
import { 
  getCycleFromProfile, 
  getTrainingDayForDate, 
  buildCycleFromProfile,
  type CycleConfig 
} from '@/utils/cycle'
import type { WeeklySequence } from '@/types'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'

interface PeriodizationEditorProps {
  onClose?: () => void
}

const METHOD_NAMES: Record<string, string> = {
  'full_body': 'Cuerpo completo',
  'upper_lower': 'Torso-Pierna',
  'push_pull_legs': 'Empuje-Tirón-Pierna',
  'body_part': 'Por grupo muscular',
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function PeriodizationEditor({ onClose }: PeriodizationEditorProps) {
  const [cycle, setCycle] = useState<CycleConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'weeks' | 'methods'>('overview')
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [weekDraft, setWeekDraft] = useState<{ days: number[]; startDate: string }>({ days: [], startDate: '' })
  const [showMethodSelector, setShowMethodSelector] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<TrainingMethodId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCycle = useCallback(async () => {
    try {
      setLoading(true)
      const profile = await db.userProfile.get('me')
      const cycle = getCycleFromProfile(profile ?? null)
      setCycle(cycle)
      setError(null)
    } catch (e) {
      setError('Error al cargar la periodización')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCycle()
  }, [loadCycle])

  const saveCycle = useCallback(async (newCycle: CycleConfig) => {
    try {
      setError(null)
      const profile = await db.userProfile.get('me')
      if (!profile) {
        throw new Error('Perfil no encontrado')
      }
      
      await db.userProfile.update(profile.id, { 
        cycle: newCycle,
        updatedAt: new Date().toISOString()
      })
      
      setCycle({ ...newCycle })
      setError(null)
    } catch (e) {
      setError('Error al guardar la periodización')
    }
  }, [])

  const generateWeekSequence = useCallback((startDate: string, weeks: number) => {
    const sequences: any[] = []
    const start = new Date(startDate)
    
    for (let w = 0; w < weeks; w++) {
      const weekStart = new Date(start)
      weekStart.setDate(start.getDate() + w * 7)
      const weekStartStr = weekStart.toISOString().slice(0, 10)
      
      const plannedDays: number[] = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart)
        day.setDate(weekStart.getDate() + d)
        const dayStr = day.toISOString().slice(0, 10)
        const dayInfo = getTrainingDayForDate(dayStr, cycle as CycleConfig)
        if (!dayInfo.isRest) {
          plannedDays.push(dayInfo.n!)
        }
      }
      
      sequences.push({
        id: crypto.randomUUID(),
        cycleId: cycle?.methodId || 'unknown',
        weekNumber: w + 1,
        startDate: weekStartStr,
        plannedDays,
        completedDays: [],
        partialDays: [],
        createdAt: new Date().toISOString()
      })
    }
    return sequences
  }, [cycle])

  const saveWeekSequences = useCallback(async (sequences: any[]) => {
    try {
      await db.weeklySequences.bulkPut(sequences)
    } catch (e) {
      console.error('Error saving week sequences:', e)
    }
  }, [])

  const handleMethodSelect = useCallback(async (methodId: TrainingMethodId) => {
    const profile = await db.userProfile.get('me')
    if (!profile) {
      return
    }
    
    const newCycle = buildCycleFromProfile(
      { ...profile, cycle: { methodId } as any },
      [1, 2, 3, 4, 5]
    )
    
    await saveCycle({ ...cycle!, ...newCycle, methodId })
    setShowMethodSelector(false)
  }, [saveCycle, cycle])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="ml-3 font-body-md text-on-surface-variant">Cargando periodización...</span>
      </div>
    )
  }

  if (error) {
    return (
      <AltheaCard className="p-6 text-center border-error/30 bg-error/10">
        <AlertCircle className="text-error mx-auto mb-2" size={32} />
        <h3 className="font-body-lg font-semibold text-error mb-2">Error</h3>
        <p className="font-body-md text-on-surface-variant">{error}</p>
        <AltheaButton onClick={loadCycle} className="mt-4" size="sm">
          Reintentar
        </AltheaButton>
      </AltheaCard>
    )
  }

  if (!cycle) {
    return (
      <AltheaCard className="p-6 text-center">
        <AlertCircle className="text-warning mx-auto mb-2" size={32} />
        <h3 className="font-body-lg font-semibold text-warning mb-2">Sin periodización</h3>
        <p className="font-body-md text-on-surface-variant mb-4">
          No hay periodización configurada. Completa el onboarding o selecciona un método.
        </p>
        <AltheaButton onClick={() => setShowMethodSelector(true)} className="mt-2">
          Seleccionar método
        </AltheaButton>
      </AltheaCard>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-headline-lg text-xl font-semibold text-on-surface">Periodización</h2>
          <p className="font-body-sm text-on-surface-variant mt-1">
            Planificación de ciclos, semanas y métodos de entrenamiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AltheaButton variant="ghost" size="sm" onClick={onClose}>
            <X size={18} /> Cerrar
          </AltheaButton>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-outline-variant/30">
        {(['overview', 'weeks', 'methods'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-label-caps text-[10px] font-semibold uppercase tracking-widest border-b-2 transition-colors ${
              activeTab === tab 
                ? 'border-primary text-primary' 
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab === 'overview' && 'Visión general'}
            {tab === 'weeks' && 'Semanas'}
            {tab === 'methods' && 'Métodos'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Current Cycle Overview */}
          <AltheaCard className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="text-primary" size={20} />
              <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">
                Ciclo actual
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-container-highest/50 rounded-lg">
                <span className="font-label-caps text-[10px] text-on-surface-variant">Método</span>
                <p className="font-body-md font-medium text-on-surface mt-1">
                  {cycle?.methodId ? METHOD_NAMES[cycle.methodId] || cycle.methodId : 'No seleccionado'}
                </p>
              </div>
              <div className="p-3 bg-surface-container-highest/50 rounded-lg">
                <span className="font-label-caps text-[10px] text-on-surface-variant">Inicio</span>
                <p className="font-body-md font-medium text-on-surface mt-1">
                  {cycle?.startDate ? new Date(cycle.startDate).toLocaleDateString('es-ES') : '—'}
                </p>
              </div>
              <div className="p-3 bg-surface-container-highest/50 rounded-lg">
                <span className="font-label-caps text-[10px] text-on-surface-variant">Días/semana</span>
                <p className="font-body-md font-medium text-on-surface mt-1">
                  {cycle?.trainingDays?.length || 0}
                </p>
              </div>
              <div className="p-3 bg-surface-container-highest/50 rounded-lg">
                <span className="font-label-caps text-[10px] text-on-surface-variant">Justificación</span>
                <p className="font-body-md text-on-surface mt-1 line-clamp-2">
                  {cycle?.methodJustification || 'Sin justificación'}
                </p>
              </div>
            </div>
          </AltheaCard>

          {/* Training Days */}
          <AltheaCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="text-primary" size={20} />
                <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Días de entrenamiento
                </span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day, i) => {
                const dayInfo = cycle?.trainingDays?.find(d => d.n === i + 1)
                const isTraining = cycle?.weekMap?.[i] !== null && cycle?.weekMap?.[i] !== undefined
                const dayTraining = cycle?.trainingDays?.find(d => d.n === cycle?.weekMap?.[i])
                return (
                  <div key={i} className={`p-3 rounded-lg text-center transition-all ${isTraining ? 'bg-primary/10 border border-primary/30' : 'bg-surface-container-highest/50'}`}>
                    <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{day}</span>
                    <p className={`font-body-md font-medium mt-1 ${isTraining ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {isTraining ? dayInfo?.name || `Día ${cycle?.weekMap?.[i]}` : 'Descanso'}
                    </p>
                  </div>
                );
              })}
              </div>
          </AltheaCard>

          {/* Method Selector */}
          <AltheaCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="text-primary" size={20} />
                <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">Método de entrenamiento</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(METHOD_NAMES).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setSelectedMethod(id as TrainingMethodId)}
                  className={`p-3 rounded-lg text-center transition-all ${cycle?.methodId === id 
                    ? 'bg-primary/10 border border-primary text-primary' 
                    : 'bg-surface-container-highest/50 border border-outline-variant/60 hover:border-primary/30'}`}
                >
                  <p className="font-body-sm font-medium text-on-surface">{name}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <AltheaButton variant="secondary" size="sm" onClick={() => setShowMethodSelector(true)}>
                Cambiar método
              </AltheaButton>
            </div>
          </AltheaCard>

          {/* Generate Week Sequences */}
          <AltheaCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="text-primary" size={20} />
                <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Generar secuencia semanal
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <AltheaInput
                label="Fecha inicio"
                type="date"
                value={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setWeekDraft(d => ({ ...d, startDate: e.target.value }))}
              />
              <AltheaInput
                label="Semanas"
                type="number"
                value="4"
                onChange={(e) => setWeekDraft(d => ({ ...d, weeks: parseInt(e.target.value) || 4 }))}
              />
            </div>
            <AltheaButton 
              onClick={() => {
                const sequences = generateWeekSequence(new Date().toISOString().slice(0, 10), 4)
                saveWeekSequences(sequences)
              }}
              className="w-full"
            >
              Generar 4 semanas
            </AltheaButton>
          </AltheaCard>
        </div>
      )}

      {activeTab === 'weeks' && (
        <AltheaCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="text-primary" size={20} />
              <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">
                Semanas del ciclo
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-highest/50 border border-outline-variant/30">
                <span className="w-10 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  Sem {i + 1}
                </span>
                <div className="flex-1 flex gap-1">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="flex-1 p-1.5 rounded text-center text-[10px] bg-surface-container-highest border border-outline-variant/30 font-label-caps">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="flex-1 text-right">
                  <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    3 días
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AltheaCard>
      )}

      {activeTab === 'methods' && (
        <AltheaCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="text-primary" size={20} />
              <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-primary">
                Métodos de entrenamiento
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(METHOD_NAMES).map(([id, name]) => (
              <button
                key={id}
                className={`p-4 rounded-xl text-center transition-all border-2 ${cycle?.methodId === id 
                  ? 'bg-primary/10 border-primary' 
                  : 'bg-surface-container-highest/50 border-outline-variant/60 hover:border-primary/30'}`}
              >
                <p className="font-body-sm font-medium text-on-surface mb-1">{name}</p>
                <p className="font-label-caps text-[10px] text-on-surface-variant capitalize">{id.replace('_', ' ')}</p>
                {cycle?.methodId === id && (
                  <span className="inline-block mt-2 px-2 py-0.5 bg-primary/20 text-primary text-[9px] font-label-caps rounded">
                    Activo
                  </span>
                )}
              </button>
            ))}
          </div>
        </AltheaCard>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant/30">
        <AltheaButton variant="ghost" onClick={onClose}>
          Cerrar
        </AltheaButton>
        <AltheaButton onClick={loadCycle}>
          <CheckCircle className="mr-1" size={14} /> Guardar cambios
        </AltheaButton>
      </div>
    </div>
  )
}

export default PeriodizationEditor