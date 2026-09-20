import { useState } from 'react'
import { signIn, signUp, resetPassword, setOfflineMode } from '@/services/firebase/auth'

type Mode = 'in' | 'up' | 'reset'

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    setOk('')
    if (!email.includes('@')) {
      setError('Ingresá un correo válido.')
      return
    }
    if (mode !== 'reset' && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'in') {await signIn(email, password)}
      else if (mode === 'up') {await signUp(email, password)}
      else {
        await resetPassword(email)
        setOk('Te enviamos un correo para restablecer la contraseña.')
        return
      }
      onDone()
    } catch (e: any) {
      setError(e?.message || 'Ocurrió un error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-transparent p-4 max-w-lg md:max-w-3xl mx-auto flex flex-col justify-center gap-4">
      <div className="text-center">
        <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Althea</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">
          {mode === 'in' && 'Iniciá sesión para sincronizar tu entrenamiento'}
          {mode === 'up' && 'Creá tu cuenta con correo electrónico'}
          {mode === 'reset' && 'Recuperá tu contraseña'}
        </p>
      </div>

      <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-4 space-y-3">
        <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vos@correo.com"
            autoComplete="email"
            className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface"
          />
        </label>
        {mode !== 'reset' && (
          <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              className="w-full mt-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface"
            />
          </label>
        )}
        {error && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-error-text">{error}</p>}
        {ok && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant st-success-text">{ok}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy
            ? 'Procesando…'
            : mode === 'in'
              ? 'Entrar'
              : mode === 'up'
                ? 'Crear cuenta'
                : 'Enviar correo'}
        </button>
        <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {mode === 'in' ? (
            <>
              <button onClick={() => setMode('reset')} className="text-primary">Olvidé mi contraseña</button>
              <button onClick={() => setMode('up')} className="text-primary">Crear cuenta</button>
            </>
          ) : (
            <button onClick={() => setMode('in')} className="text-primary">Ya tengo cuenta</button>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          setOfflineMode(true)
          onDone()
        }}
        className="btn-secondary w-full"
      >
        Continuar sin cuenta (solo en este dispositivo)
      </button>
    </div>
  )
}
