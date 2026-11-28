import { useCallback, useEffect, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { currentUser } from '@/services/firebase/auth'
import {
  approveRequest,
  createInvite,
  getGroup,
  listGroupInvites,
  listRequests,
  rejectRequest,
  removeMember,
  revokeInvite,
} from '@/services/crossfit/groups/groupsService'
import { canRemoveMember, groupRoleFor, memberLabel } from '@/services/crossfit/groups/groupAccess'
import { inviteIsUsable, inviteLink } from '@/services/crossfit/groups/invite'
import type { CfGroup, CfGroupInvite, CfJoinRequest, CfJoinRequestStatus } from '@/services/crossfit/groups/types'

function fmtDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

const STATUS_LABEL: Record<CfJoinRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

const STATUS_VARIANT: Record<CfJoinRequestStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

export default function CrossfitGrupoDetalle({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const user = currentUser()
  const [group, setGroup] = useState<CfGroup | null>(null)
  const [requests, setRequests] = useState<CfJoinRequest[]>([])
  const [invites, setInvites] = useState<CfGroupInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!user) { setLoading(false); setError('Iniciá sesión para ver el grupo.'); return }
    setLoading(true)
    try {
      const next = await getGroup(groupId)
      if (!next) { throw new Error('No tenés acceso a este grupo.') }
      setGroup(next)
      if (next.ownerId === user.uid) {
        const [nextRequests, nextInvites] = await Promise.all([
          listRequests(groupId),
          listGroupInvites(groupId),
        ])
        setRequests(nextRequests)
        setInvites(nextInvites)
      } else {
        setRequests([])
        setInvites([])
      }
      setError('')
    } catch (e) {
      setGroup(null)
      setError(e instanceof Error ? e.message : 'No se pudo cargar el grupo.')
    } finally {
      setLoading(false)
    }
  }, [groupId, user])

  useEffect(() => { void load() }, [load])

  const activeInvite = invites.find((invite) => inviteIsUsable(invite)) ?? null
  const link = activeInvite ? inviteLink(activeInvite.token, window.location.origin) : ''
  const role = group ? groupRoleFor(group, user?.uid) : null

  const share = async () => {
    if (!link || !group) { return }
    setNotice('')
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Invitación a ${group.name}`,
          text: `Te invito al grupo ${group.name} en Althea.`,
          url: link,
        })
      } else {
        await navigator.clipboard.writeText(link)
        setNotice('Enlace copiado. Pegalo en el chat o correo que uses.')
      }
    } catch {
      setNotice('No se pudo compartir automáticamente. Copiá el enlace manualmente.')
    }
  }

  const copy = async () => {
    if (!link) { return }
    try {
      await navigator.clipboard.writeText(link)
      setNotice('Enlace copiado.')
    } catch {
      setNotice('No se pudo copiar. Seleccioná el enlace y copialo a mano.')
    }
  }

  const generate = async () => {
    if (!group) { return }
    setBusy('invite')
    setNotice('')
    try {
      await createInvite(group)
      await load()
      setNotice('Invitación creada. Compartila con quien quieras sumar.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la invitación.')
    } finally {
      setBusy('')
    }
  }

  const revoke = async () => {
    if (!activeInvite) { return }
    if (!window.confirm('¿Revocar esta invitación? El enlace dejará de funcionar.')) { return }
    setBusy('invite')
    setNotice('')
    try {
      await revokeInvite(activeInvite.token)
      await load()
      setNotice('Invitación revocada. Podés generar una nueva cuando quieras.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar la invitación.')
    } finally {
      setBusy('')
    }
  }

  const review = async (request: CfJoinRequest, approve: boolean) => {
    setBusy(request.uid)
    setError('')
    setNotice('')
    try {
      if (approve) { await approveRequest(groupId, request.uid) }
      else { await rejectRequest(groupId, request.uid) }
      await load()
      setNotice(approve ? `${request.displayName} ya es parte del grupo.` : 'Solicitud rechazada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar la solicitud.')
    } finally {
      setBusy('')
    }
  }

  const remove = async (uid: string) => {
    if (!group) { return }
    if (!window.confirm(`¿Quitar a ${memberLabel(group, uid)} del grupo?`)) { return }
    setBusy(uid)
    setError('')
    setNotice('')
    try {
      await removeMember(groupId, uid)
      await load()
      setNotice('Integrante quitado del grupo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar al integrante.')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return <p className="text-sm text-on-surface-variant py-8 text-center">Cargando grupo…</p>
  }

  if (!group) {
    return (
      <div className="space-y-3">
        <AltheaButton variant="secondary" className="min-h-[44px]" onClick={onBack}>Volver a mis grupos</AltheaButton>
        <p role="alert" className="text-sm text-error">{error || 'No se pudo abrir el grupo.'}</p>
      </div>
    )
  }

  const pending = requests.filter((request) => request.status === 'pending')
  const reviewed = requests.filter((request) => request.status !== 'pending')
  const members = [...group.memberIds].sort((a, b) => {
    if (a === group.ownerId) { return -1 }
    if (b === group.ownerId) { return 1 }
    return memberLabel(group, a).localeCompare(memberLabel(group, b), 'es')
  })

  return (
    <div className="space-y-4">
      <AltheaButton variant="secondary" className="min-h-[44px]" onClick={onBack}>← Mis grupos</AltheaButton>

      <AltheaCard>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-headline text-xl font-semibold text-on-surface">{group.name}</h2>
            <AltheaBadge variant={role === 'owner' ? 'primary' : 'secondary'}>
              {role === 'owner' ? 'Entrenador' : 'Atleta'}
            </AltheaBadge>
          </div>
          {group.description && <p className="text-sm text-on-surface-variant">{group.description}</p>}
          {group.schedule && <p className="text-xs text-on-surface-variant">🕒 {group.schedule}</p>}
          <p className="text-xs text-on-surface-variant">
            Entrenador: {group.ownerName || memberLabel(group, group.ownerId)} · {group.memberIds.length} integrantes
          </p>
        </div>
      </AltheaCard>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {notice && <p role="status" className="text-sm text-secondary">{notice}</p>}

      {role === 'owner' && (
        <AltheaCard>
          <div className="space-y-3">
            <div>
              <h3 className="font-headline text-lg font-semibold text-on-surface">Invitación</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                El enlace no agrega a nadie solo: la persona envía una solicitud y vos la aprobás.
              </p>
            </div>

            {activeInvite ? (
              <>
                <label className="block text-aux" htmlFor="group-invite-link">Enlace para compartir</label>
                <input
                  id="group-invite-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input font-body-md text-xs"
                />
                <p className="text-[11px] text-on-surface-variant">
                  Vence el {fmtDate(activeInvite.expiresAt)}. Podés revocarlo cuando quieras.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <AltheaButton icon="share" className="min-h-[44px]" onClick={() => void share()}>Compartir</AltheaButton>
                  <AltheaButton variant="secondary" icon="content_copy" className="min-h-[44px]" onClick={() => void copy()}>Copiar</AltheaButton>
                  <AltheaButton
                    variant="danger"
                    className="min-h-[44px] col-span-2"
                    loading={busy === 'invite'}
                    onClick={() => void revoke()}
                  >
                    Revocar invitación
                  </AltheaButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant">
                  {invites[0]?.revoked
                    ? 'La última invitación fue revocada.'
                    : invites[0]
                      ? 'La última invitación expiró.'
                      : 'Todavía no generaste una invitación.'}
                </p>
                <AltheaButton
                  icon="link"
                  className="min-h-[44px] w-full"
                  loading={busy === 'invite'}
                  onClick={() => void generate()}
                >
                  Generar invitación
                </AltheaButton>
              </>
            )}
          </div>
        </AltheaCard>
      )}

      {role === 'owner' ? (
        <AltheaCard>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-headline text-lg font-semibold text-on-surface">Solicitudes</h3>
              {pending.length > 0 && <AltheaBadge variant="warning">{pending.length} pendientes</AltheaBadge>}
            </div>

            {requests.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No hay solicitudes todavía.</p>
            ) : (
              <ul className="space-y-3">
                {[...pending, ...reviewed].map((request) => (
                  <li key={request.uid} className="rounded-lg border border-outline-variant p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-on-surface truncate">{request.displayName || 'Sin nombre'}</p>
                        {request.email && <p className="text-xs text-on-surface-variant truncate">{request.email}</p>}
                      </div>
                      <AltheaBadge variant={STATUS_VARIANT[request.status]}>{STATUS_LABEL[request.status]}</AltheaBadge>
                    </div>
                    {request.message && <p className="text-xs text-on-surface-variant">{request.message}</p>}
                    <p className="text-[11px] text-on-surface-variant">Solicitud del {fmtDate(request.createdAt)}</p>
                    {request.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2">
                        <AltheaButton
                          className="min-h-[44px]"
                          loading={busy === request.uid}
                          onClick={() => void review(request, true)}
                        >
                          Aprobar
                        </AltheaButton>
                        <AltheaButton
                          variant="secondary"
                          className="min-h-[44px]"
                          disabled={busy === request.uid}
                          onClick={() => void review(request, false)}
                        >
                          Rechazar
                        </AltheaButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AltheaCard>
      ) : (
        <AltheaCard>
          <p className="text-sm text-on-surface-variant">
            Sos atleta en este grupo. El entrenador administra las invitaciones, las solicitudes y los integrantes.
          </p>
        </AltheaCard>
      )}

      <AltheaCard>
        <div className="space-y-3">
          <h3 className="font-headline text-lg font-semibold text-on-surface">Integrantes</h3>
          <ul className="space-y-2">
            {members.map((uid) => (
              <li key={uid} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-on-surface truncate">{memberLabel(group, uid)}</p>
                  <p className="text-[11px] text-on-surface-variant">{uid === group.ownerId ? 'Entrenador' : 'Atleta'}</p>
                </div>
                {role === 'owner' && user && canRemoveMember(group, user.uid, uid) && (
                  <AltheaButton
                    variant="danger"
                    className="min-h-[44px]"
                    loading={busy === uid}
                    onClick={() => void remove(uid)}
                  >
                    Quitar
                  </AltheaButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      </AltheaCard>
    </div>
  )
}
