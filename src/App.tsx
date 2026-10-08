import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import AppNav from '@/components/layout/AppNav'
import { RequiredActionGate } from '@/components/notifications/RequiredActionGate'
import { AppHeader, TempleBackdrop } from '@/components/brand/temple'
import { MeanderFrieze } from '@/components/brand/MeanderFrieze'
import { useEffect, useState, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { weekdayOfKey } from '@/utils/dates'
import { ErrorBoundary, EntrenarErrorBoundary, NutricionErrorBoundary, CoachErrorBoundary, ProgresoErrorBoundary } from '@/components/ErrorBoundary'

// Lazy load all pages to reduce initial bundle size
const Inicio = lazy(() => import('@/pages/Inicio'))
const Entrenar = lazy(() => import('@/pages/Entrenar'))
const Progresos = lazy(() => import('@/pages/Progreso'))
const Coach = lazy(() => import('@/pages/Coach'))
const Mas = lazy(() => import('@/pages/Mas'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Biblioteca = lazy(() => import('@/pages/Biblioteca'))
const Rutina = lazy(() => import('@/pages/Rutina'))
const Calendario = lazy(() => import('@/pages/Calendario'))
const Nutricion = lazy(() => import('@/pages/Nutricion'))
const Recuperacion = lazy(() => import('@/pages/Recuperacion'))
const Perfil = lazy(() => import('@/pages/Perfil'))
const Login = lazy(() => import('@/pages/Login'))
// El chat es un FAB que está montado siempre, pero arrastra detrás todo el
// subsistema de IA (chatService → unifiedPipeline → systemPrompt → contextBuilder
// → *MethodsDB), que son ~150 KB de JS que el primer render no usa. Con import
// estático esa cadena entra en el chunk inicial. Se difiere: el FAB aparece
// tras cargar su chunk, sin bloquear el resto de la app.
const ChatWidget = lazy(() => import('@/components/chat/ChatWidget'))

// Fallback component for lazy loading
function PageLoader() {
  return (
    <div className="flex h-[calc(100vh-52px)] items-center justify-center bg-surface">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-on-surface-variant text-sm">Cargando…</p>
      </div>
    </div>
  )
}

// Wrapper component that adds Suspense to lazy-loaded pages
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  )
}

async function isTrainingDayLocal(dateStr:string): Promise<boolean> {
  try{
    // Los cambios manuales de día (override) mandan sobre la planificación:
    // es una decisión explícita del usuario, no un fallback.
    const { getOverrideDay } = await import('@/services/storage/sessionOverrideStore')
    const override = await getOverrideDay(dateStr).catch(()=>null)
    if(override !== null && override !== undefined) {return true}
    const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
    const raw = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    const active = raw?.find((r:any)=>r.id===activeId) || raw?.[0]
    const pv = await getActiveVersion(PROFILE_SCOPE).catch(()=>null)
    const cyc = pv?.cycle ?? active?.cycle
    // Sin planificación o con error de lectura: desconocido NO es entrenamiento.
    if(!cyc?.weekMap) {return false}
    const dow = weekdayOfKey(dateStr)
    return (cyc.weekMap[dow] ?? null) !== null
  }catch{ return false }
}

function Layout() {
  const loc = useLocation()
  const navigate = useNavigate()
  const hideNav = loc.pathname === '/onboarding' || loc.pathname === '/login'
  const [updateReady, setUpdateReady] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false)
const [isOfflineMode, setIsOfflineMode] = useState(false)

  // Initialize Firebase config at top level
  useEffect(() => {
    let alive = true
    import('@/services/firebase/config').then(m => {
      if (alive) {setIsFirebaseConfigured(m.isFirebaseConfigured())}
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Initialize offline mode at top level (only after Firebase is configured)
  useEffect(() => {
    if (!isFirebaseConfigured) {return}
    let alive = true
    import('@/services/firebase/auth').then(({ getOfflineMode }) => {
      if (alive) {setIsOfflineMode(getOfflineMode())}
    }).catch(() => {})
    return () => { alive = false }
  }, [isFirebaseConfigured])

  // Gate de cuenta: si Firebase está configurado y no hay sesión ni modo offline → /login
  useEffect(() => {
    let alive = true
    if (!isFirebaseConfigured) {
      if (alive) { setNeedsLogin(false); setAuthChecked(true) }
      return
    }
    if (isOfflineMode) {
      if (alive) { setNeedsLogin(false); setAuthChecked(true) }
      return
    }
    import('@/services/firebase/auth').then(({ onUser }) => {
      if (alive) {onUser((u) => {
        if (!alive) {return}
        // Cambio de cuenta en el mismo navegador: los datos locales pertenecen
        // al usuario anterior. Se limpian para que no contaminen al nuevo
        // (misma utilidad que eliminación de cuenta; preserva preferencias UI).
        // Primer login (sin uid previo): se conservan (datos anónimos propios).
        if (u) {
          void (async () => {
            try {
              const { shouldWipeOnAccountSwitch, rememberAccountUid } = await import('@/services/storage/accountWipe')
              const lastUid = localStorage.getItem('althea:lastUid')
              if (shouldWipeOnAccountSwitch(lastUid, u.uid)) {
                const { clearUserDataOnAccountDelete } = await import('@/services/storage/accountWipe')
                clearUserDataOnAccountDelete().catch(() => {}).finally(() => { rememberAccountUid(u.uid) })
              } else if (!lastUid) {
                rememberAccountUid(u.uid)
              }
            } catch { /* noop: jamás bloquear el login */ }
          })()
        }
        setNeedsLogin(!u)
        setAuthChecked(true)
      })}
    }).catch(() => {})
    return () => { alive = false }
  }, [isFirebaseConfigured, isOfflineMode])

  // Migrar rutinas de localStorage a Dexie al iniciar
  useEffect(() => {
    import('@/services/storage/routineStore').then(({ migrateRoutinesFromLocalStorage }) => {
      migrateRoutinesFromLocalStorage()
    }).catch(() => {})
  }, [])

  // Scheduler de notificaciones locales: revisa cada minuto + al volver a la app.
  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const { checkAndFire } = await import('@/services/notifications/scheduler')
        await checkAndFire((kind) => { if (kind === 'comoEstas' || kind === 'cuestionario') { navigate('/recuperacion') } }, isTrainingDayLocal)
      } catch { /* noop */ }
    }
    run()
    // Push en primer plano: al tocar abre destino (cuestionario si viene marcado)
    import('@/services/firebase/messaging').then(({ listenForeground }) => {
      listenForeground((data) => {
        if (data?.open === 'recuperacion') { navigate('/recuperacion') }
      })
    }).catch(() => {})
    const id = setInterval(() => { if (alive) { run() } }, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') { run() } }
    document.addEventListener('visibilitychange', onVis)
    // ET21: al recuperar conexión, subir operaciones pendientes (idempotente, sin duplicar).
    const onOnline = async () => {
      try {
        const { isFirebaseConfigured } = await import('@/services/firebase/config')
        if (!isFirebaseConfigured()) { return }
        const { currentUser } = await import('@/services/firebase/auth')
        const u = currentUser()
        if (!u) { return }
        const { pendingCount } = await import('@/services/sync/opQueue')
        if ((await pendingCount()) === 0) { return }
        const { processQueue } = await import('@/services/sync/engine')
        const { firestoreRemote } = await import('@/services/firebase/sync')
        await processQueue(u.uid, firestoreRemote(u.uid))
      } catch { /* noop: lo pendiente se conserva */ }
    }
    window.addEventListener('online', onOnline)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline) }
  }, [navigate])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => setUpdateReady(true))
    }
    db.userProfile.get('me').then(p => {
      const needsOnboarding = !p?.onboardingDone || !(p as any)?.email
      if (needsOnboarding && loc.pathname !== '/onboarding') {
        navigate('/onboarding', { replace: true })
      }
    })
  }, [loc.pathname, navigate])

  if (!authChecked) {return <div className="p-8 text-center">Cargando…</div>}
  if (needsLogin && loc.pathname !== '/login') {
    return <Login onDone={() => { setNeedsLogin(false); navigate('/', { replace: true }) }} />
  }
  return (
    <div className="shell-safe-top">
    <RequiredActionGate>
      <TempleBackdrop />
      {!hideNav && <AppHeader />}
      {!hideNav && <MeanderFrieze height={3} color="rgb(var(--c-gold-rgb) / 0.4)" className="shell-content-nudge" />}
      <div className="shell-content relative z-10 max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 pt-4 pb-24 md:pb-10 transition-[margin-left] duration-200">
      <Routes>
        <Route path="/login" element={<LazyPage><Login onDone={() => navigate('/', { replace: true })} /></LazyPage>} />
        <Route path="/" element={<LazyPage><Inicio /></LazyPage>} />
        <Route path="/entrenar" element={<LazyPage><EntrenarErrorBoundary componentName="Entrenar"><Entrenar /></EntrenarErrorBoundary></LazyPage>} />
        <Route path="/progresos" element={<LazyPage><ProgresoErrorBoundary componentName="Progreso"><Progresos /></ProgresoErrorBoundary></LazyPage>} />
        <Route path="/progreso" element={<LazyPage><ProgresoErrorBoundary componentName="Progreso"><Progresos /></ProgresoErrorBoundary></LazyPage>} />
        <Route path="/coach" element={<LazyPage><CoachErrorBoundary componentName="Coach"><Coach /></CoachErrorBoundary></LazyPage>} />
        <Route path="/mas" element={<LazyPage><Mas /></LazyPage>} />
        <Route path="/onboarding" element={<LazyPage><Onboarding /></LazyPage>} />
        <Route path="/biblioteca" element={<LazyPage><Biblioteca /></LazyPage>} />
        <Route path="/rutina" element={<LazyPage><Rutina /></LazyPage>} />
        <Route path="/rutinas" element={<LazyPage><Rutina /></LazyPage>} />
        <Route path="/calendario" element={<LazyPage><Calendario /></LazyPage>} />
        <Route path="/nutricion" element={<LazyPage><NutricionErrorBoundary componentName="Nutricion"><Nutricion /></NutricionErrorBoundary></LazyPage>} />
        <Route path="/recuperacion" element={<LazyPage><Recuperacion /></LazyPage>} />
        <Route path="/perfil" element={<LazyPage><Perfil /></LazyPage>} />
      </Routes>
      </div>
      {!hideNav && <AppNav/>}
      {!hideNav && (
        <Suspense fallback={null}>
          <ChatWidget/>
        </Suspense>
      )}
      {updateReady && <div style={{ top: 'calc(var(--safe-top) + 0.5rem)' }} className="fixed left-2 right-2 z-50 bg-tertiary text-on-tertiary text-sm p-3 rounded-xl text-center shadow-al-md">Nueva versión disponible — recargá la app</div>}
      <OnlineBanner/>
      </RequiredActionGate>
    </div>
  )
}
function OnlineBanner(){
  const [online,setOnline]=useState(navigator.onLine)
  useEffect(()=>{
    const on=()=>setOnline(true), off=()=>setOnline(false)
    window.addEventListener('online',on); window.addEventListener('offline',off)
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off)}
  },[])
  if(online) {return null}
  return <div style={{ top: 'var(--safe-top)' }} className="fixed left-0 right-0 z-40 bg-surface-container text-on-surface text-xs text-center py-1 border-b border-outline-variant">Modo offline — todo funciona localmente</div>
}

import { applyAppearance } from '@/utils/appearance'

export default function App(){
  const [ready,setReady]=useState(false)
  useEffect(()=>{
    applyAppearance()
    // Sesiones que cruzaron la medianoche: se cierran como "no realizadas"
    // ANTES del primer render, para que la pestaña Entrenar no aparezca
    // nunca con una sesión vencida.
    db.open()
      .then(()=>import('@/services/training/sessionStore').then(m=>m.closeStaleSessions()))
      .catch(()=>{})
      .finally(()=>setReady(true))
  },[])
  if(!ready) {return <div className="p-8 text-center">Cargando…</div>}
  // Boundary global: evita pantalla blanca/negra ante un error de render en
  // cualquier parte del árbol (los boundaries por página están dentro de Routes).
  return <ErrorBoundary componentName="App"><BrowserRouter><Layout/></BrowserRouter></ErrorBoundary>
}
