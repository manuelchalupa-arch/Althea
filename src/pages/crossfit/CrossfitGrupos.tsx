import { useCallback, useEffect, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaTextarea } from '@/components/althea/AltheaInput'
import { currentUser } from '@/services/firebase/auth'
import { createGroup, groupsAvailable, listMyGroups } from '@/services/crossfit/groups/groupsService'
import { groupRoleFor } from '@/services/crossfit/groups/groupAccess'
import type { CfGroup } from '@/services/crossfit/groups/types'
import CrossfitGrupoDetalle from './CrossfitGrupoDetalle'

export default function CrossfitGrupos() {
  const user = currentUser()
  const [groups, setGroups] = useState<CfGroup[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [schedule, setSchedule] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!user) { setGroups([]); return }
    try {
      setGroups(await listMyGroups(user.uid))
      setError('')
    } catch (e) {
      setGroups([])
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus grupos.')
    }
  }, [user])

  useEffect(() => { void reload() }, [reload])

  const submit = async () => {
    if (!name.trim()) { setError('El nombre del grupo es obligatorio.'); return }
    setBusy(true)
    setError('')
    try {
      const group = await createGroup({ name, description, schedule })
      setName('')
      setDescription('')
      setSchedule('')
      setCreating(false)
      await reload()
      setSelectedId(group.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el grupo.')
    } finally {
      setBusy(false)
    }
  }

  if (selectedId) {
    return (
      <CrossfitGrupoDetalle
        groupId={selectedId}
        onBack={() => { setSelectedId(null); void reload() }}
      />
    )
  }

  if (!groupsAvailable()) {
    return (
      <AltheaCard>
        <AltheaEmpty
          icon="groups"
          title="Grupos con cuenta"
          description="Para crear grupos o sumarte a uno necesitás iniciar sesión con una cuenta de Althea y tener conexión."
        />
      </AltheaCard>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">CrossFit compartido</p>
          <h2 className="font-headline text-xl font-semibold text-on-surface">Mis grupos</h2>
        </div>
        {!creating && (
          <AltheaButton icon="add" className="min-h-[44px]" onClick={() => { setCreating(true); setError('') }}>
            Crear grupo
          </AltheaButton>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {creating && (
        <AltheaCard>
          <div className="space-y-3">
            <h3 className="font-headline text-lg font-semibold text-on-surface">Nuevo grupo</h3>
            <AltheaInput
              label="Nombre del grupo"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Turno mañana"
              autoComplete="off"
            />
            <AltheaTextarea
              label="Descripción (opcional)"
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué es el grupo, nivel, objetivo…"
            />
            <AltheaInput
              label="Horario o turno (opcional)"
              value={schedule}
              maxLength={80}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="Ej.: Lunes y miércoles 19:00"
              autoComplete="off"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <AltheaButton className="min-h-[44px] sm:flex-1" loading={busy} onClick={() => void submit()}>
                Crear grupo
              </AltheaButton>
              <AltheaButton
                variant="secondary"
                className="min-h-[44px] sm:flex-1"
                disabled={busy}
                onClick={() => { setCreating(false); setError('') }}
              >
                Cancelar
              </AltheaButton>
            </div>
          </div>
        </AltheaCard>
      )}

      {groups === null ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">Cargando grupos…</p>
      ) : groups.length === 0 ? (
        <AltheaEmpty
          icon="groups"
          title="Todavía no tenés grupos"
          description="Creá un grupo como entrenador o pedí ingreso con un enlace de invitación."
          action={!creating ? (
            <AltheaButton icon="add" className="min-h-[44px]" onClick={() => setCreating(true)}>
              Crear mi primer grupo
            </AltheaButton>
          ) : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const role = groupRoleFor(group, user?.uid)
            return (
              <li key={group.id}>
                <AltheaCard>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-headline text-lg font-semibold text-on-surface">{group.name}</h3>
                      <AltheaBadge variant={role === 'owner' ? 'primary' : 'secondary'}>
                        {role === 'owner' ? 'Entrenador' : 'Atleta'}
                      </AltheaBadge>
                    </div>
                    {group.description && <p className="text-sm text-on-surface-variant">{group.description}</p>}
                    {group.schedule && (
                      <p className="text-xs text-on-surface-variant inline-flex items-center gap-1.5">
                        <span aria-hidden>🕒</span>{group.schedule}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-on-surface-variant">
                        {group.memberIds.length} {group.memberIds.length === 1 ? 'integrante' : 'integrantes'}
                      </span>
                      <AltheaButton variant="secondary" className="min-h-[44px]" onClick={() => setSelectedId(group.id)}>
                        Abrir grupo
                      </AltheaButton>
                    </div>
                  </div>
                </AltheaCard>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
