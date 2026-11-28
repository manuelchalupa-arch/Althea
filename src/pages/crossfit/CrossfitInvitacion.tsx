import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaTextarea } from '@/components/althea/AltheaInput'
import { currentUser } from '@/services/firebase/auth'
import { createJoinRequest, getInvite, getMyRequest } from '@/services/crossfit/groups/groupsService'
import { inviteIsUsable } from '@/services/crossfit/groups/invite'
import type { CfGroupInvite, CfJoinRequest } from '@/services/crossfit/groups/types'

function fmtDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function CrossfitInvitacion() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const user = currentUser()
  const [invite, setInvite] = useState<CfGroupInvite | null>(null)
  const [request, setRequest] = useState<CfJoinRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      setLoading(true)
      try {
        const nextInvite = await getInvite(token)
        if (!alive) { return }
        setInvite(nextInvite)
        if (nextInvite && user) {
          const nextRequest = await getMyRequest(nextInvite.groupId, user.uid)
          if (alive) { setRequest(nextRequest) }
        }
        setError('')
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : 'No se pudo abrir la invitación.') }
      } finally {
        if (alive) { setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [token, user])

  useEffect(() => {
    if (displayName) { return }
    const suggested = user?.displayName?.trim() || user?.email?.split('@')[0] || ''
    if (suggested) { setDisplayName(suggested) }
  }, [displayName, user])

  const submit = async () => {
    if (!invite || !user) { return }
    if (!displayName.trim()) { setError('Escribí tu nombre para que el entrenador te reconozca.'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await createJoinRequest({
        invite,
        displayName,
        email: user.email ?? '',
        message,
      })
      setRequest(created)
      setNotice('Solicitud enviada. Queda pendiente hasta que el entrenador la apruebe.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-on-surface-variant py-8 text-center">Cargando invitación…</p>
  }

  const goBack = () => navigate('/crossfit')

  if (!user) {
    return (
      <AltheaCard>
        <AltheaEmpty
          icon="groups"
          title="Iniciá sesión para continuar"
          description="Para pedir ingreso a un grupo necesitás una cuenta de Althea."
          action={<AltheaButton className="min-h-[44px]" onClick={() => navigate('/login')}>Iniciar sesión</AltheaButton>}
        />
      </AltheaCard>
    )
  }

  if (!invite) {
    return (
      <AltheaCard>
        <AltheaEmpty
          icon="link"
          title="Enlace no válido"
          description="Puede estar mal copiado o pertenecer a una invitación que ya no existe."
          action={<AltheaButton className="min-h-[44px]" onClick={goBack}>Ir a CrossFit</AltheaButton>}
        />
      </AltheaCard>
    )
  }

  const usable = inviteIsUsable(invite)

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <AltheaCard>
        <div className="space-y-2">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Invitación privada</p>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">{invite.groupName || 'Grupo de CrossFit'}</h1>
          <p className="text-sm text-on-surface-variant">
            Althea no te agrega automáticamente: enviás una solicitud y el entrenador decide.
          </p>
          <p className="text-xs text-on-surface-variant">Enlace válido hasta el {fmtDate(invite.expiresAt)}.</p>
        </div>
      </AltheaCard>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {notice && <p role="status" className="text-sm text-secondary">{notice}</p>}

      {!usable ? (
        <AltheaCard>
          <AltheaEmpty
            icon="link"
            title={invite.revoked ? 'Invitación revocada' : 'Invitación vencida'}
            description={invite.revoked
              ? 'El entrenador revocó este enlace. Pedile uno nuevo.'
              : 'Este enlace ya expiró. Pedile al entrenador que genere uno nuevo.'}
            action={<AltheaButton className="min-h-[44px]" onClick={goBack}>Ir a CrossFit</AltheaButton>}
          />
        </AltheaCard>
      ) : request?.status === 'pending' ? (
        <AltheaCard>
          <div className="space-y-2">
            <AltheaBadge variant="warning">Pendiente</AltheaBadge>
            <p className="text-sm text-on-surface">Tu solicitud ya está enviada. Esperá a que el entrenador la apruebe.</p>
            <AltheaButton variant="secondary" className="min-h-[44px]" onClick={goBack}>Volver a CrossFit</AltheaButton>
          </div>
        </AltheaCard>
      ) : request?.status === 'approved' ? (
        <AltheaCard>
          <div className="space-y-2">
            <AltheaBadge variant="success">Aprobado</AltheaBadge>
            <p className="text-sm text-on-surface">Tu solicitud fue aprobada. Ya sos parte del grupo.</p>
            <AltheaButton className="min-h-[44px]" onClick={() => navigate('/crossfit?seccion=grupos')}>
              Ir a mis grupos
            </AltheaButton>
          </div>
        </AltheaCard>
      ) : (
        <AltheaCard>
          <div className="space-y-3">
            {request?.status === 'rejected' && (
              <div className="space-y-1">
                <AltheaBadge variant="danger">Rechazado</AltheaBadge>
                <p className="text-sm text-on-surface-variant">
                  El entrenador rechazó la solicitud anterior. Podés volver a pedir ingreso con este enlace.
                </p>
              </div>
            )}
            <h2 className="font-headline text-lg font-semibold text-on-surface">
              {request?.status === 'rejected' ? 'Volver a solicitar ingreso' : 'Solicitar ingreso'}
            </h2>
            <AltheaInput
              label="Tu nombre"
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Cómo te reconoce el entrenador"
              autoComplete="name"
            />
            <AltheaTextarea
              label="Mensaje para el entrenador (opcional)"
              value={message}
              maxLength={300}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej.: voy al turno de la mañana"
            />
            <AltheaButton className="min-h-[44px] w-full" loading={busy} onClick={() => void submit()}>
              Enviar solicitud
            </AltheaButton>
          </div>
        </AltheaCard>
      )}
    </div>
  )
}
