import { useState } from 'react'
import { signIn, signUp, resetPassword, setOfflineMode, signInWithGoogle } from '@/services/firebase/auth'
import { AltheaAvatar } from '@/components/brand/AltheaAvatar'

type Mode = 'in' | 'up' | 'reset'

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const [googleBusy, setGoogleBusy] = useState(false)

  const loginWithGoogle = async () => {
    setError('')
    setOk('')
    setGoogleBusy(true)
    try {
      await signInWithGoogle()
      onDone()
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar sesión con Google.')
    } finally {
      setGoogleBusy(false)
    }
  }

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
    <div className="min-h-screen bg-transparent p-4 sm:px-5 lg:px-8 mx-auto flex flex-col justify-center gap-4">
      {/* Ancla de marca: el busto es lo primero que ve quien entra.
          Tamano fluid 120px -> 200px en lg. Contexto 'hero' usa el asset de
          1000px optimizado, asi que no cargamos un PNG enorme. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
        <div className="shrink-0 flex justify-center lg:justify-start">
          <AltheaAvatar
            context="hero"
            size={120}
            alt="Busto clásico de Althea: figura de mármol con corona de laurel de bronce"
            className="block lg:hidden"
          />
          <AltheaAvatar
            context="hero"
            size={200}
            alt="Busto clásico de Althea: figura de mármol con corona de laurel de bronce"
            className="hidden lg:block"
          />
        </div>
        <div className="text-center lg:text-left">
        <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Althea</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">
          {mode === 'in' && 'Iniciá sesión para sincronizar tu entrenamiento'}
          {mode === 'up' && 'Creá tu cuenta con correo electrónico'}
          {mode === 'reset' && 'Recuperá tu contraseña'}
        </p>
        </div>
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

        {/* Google Sign-In: funciona en iPhone (redirect) y desktop (popup). */}
        {mode !== 'reset' && (
          <>
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-outline-variant/50" />
              <span className="text-[10px] font-label-caps text-on-surface-variant uppercase">o</span>
              <div className="flex-1 h-px bg-outline-variant/50" />
            </div>
            <button
              onClick={loginWithGoogle}
              disabled={googleBusy || busy}
              className="w-full min-h-[44px] rounded-lg border border-outline-variant bg-surface/60 backdrop-blur-sm text-on-surface font-label-md text-[12px] font-semibold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
                <path fill="#FBBC05" d="M4.5 10.48a4.8 4.8 0 0 1 0-3.07V5.34H1.83a8 8 0 0 0 0 7.21l2.67-2.07z" />
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.34l2.67 2.07a4.8 4.8 0 0 1 4.48-3.23z" />
              </svg>
              {googleBusy ? 'Conectando…' : 'Continuar con Google'}
            </button>
          </>
        )}
        <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {mode === 'in' ? (
            <>
              <button onClick={() => setMode('reset')} className="min-w-[44px] min-h-[44px] px-3 py-1.5 text-primary">Olvidé mi contraseña</button>
              <button onClick={() => setMode('up')} className="min-w-[44px] min-h-[44px] px-3 py-1.5 text-primary">Crear cuenta</button>
            </>
          ) : (
            <button onClick={() => setMode('in')} className="min-w-[44px] min-h-[44px] px-3 py-1.5 text-primary">Ya tengo cuenta</button>
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
