import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import AppNav from '@/components/layout/AppNav'
import ChatWidget from '@/components/chat/ChatWidget'
import { AppHeader, TempleBackdrop } from '@/components/brand/temple'
import { useEffect, useState, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/services/storage/db'

// Custom hook to safely get offline mode - extracted to avoid calling hook in callback
function useFirebaseOfflineMode() {
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false)

  // Initialize Firebase config at top level
  useEffect(() => {
    let alive = true
    import('@/services/firebase/config').then(m => {
      if (alive) { setIsFirebaseConfigured(m.isFirebaseConfigured()) }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Initialize offline mode at top level (only after Firebase is configured)
  useEffect(() => {
    if (!isFirebaseConfigured) { return }
    let alive = true
import('@/services/firebase/auth').then(({ getOfflineMode }) => {
      if (alive) {setIsOfflineMode(getOfflineMode())}
    }).catch(() => {})
    return () => { alive = false }
  }, [isFirebaseConfigured])

  return isOfflineMode
}

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
    const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
    const raw = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    const active = raw?.find((r:any)=>r.id===activeId) || raw?.[0]
    const cyc = active?.cycle
    if(!cyc?.weekMap) {return true}
    const dow = new Date(dateStr+'T12:00:00').getDay()
    return (cyc.weekMap[dow] ?? null) != null
  }catch{ return true }
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
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
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
  }, [loc.pathname])

  if (!authChecked) {return <div className="p-8 text-center">Cargando…</div>}
  if (needsLogin && loc.pathname !== '/login') {
    return <Login onDone={() => { setNeedsLogin(false); navigate('/', { replace: true }) }} />
  }
  return (
    <>
      <TempleBackdrop />
      {!hideNav && <AppHeader />}
      <div className="md:ml-[208px] relative z-10">
      <Routes>
        <Route path="/login" element={<LazyPage><Login onDone={() => navigate('/', { replace: true })} /></LazyPage>} />
        <Route path="/" element={<LazyPage><Inicio /></LazyPage>} />
        <Route path="/entrenar" element={<LazyPage><Entrenar /></LazyPage>} />
        <Route path="/progresos" element={<LazyPage><Progresos /></LazyPage>} />
        <Route path="/progreso" element={<LazyPage><Progresos /></LazyPage>} />
        <Route path="/coach" element={<LazyPage><Coach /></LazyPage>} />
        <Route path="/mas" element={<LazyPage><Mas /></LazyPage>} />
        <Route path="/onboarding" element={<LazyPage><Onboarding /></LazyPage>} />
        <Route path="/biblioteca" element={<LazyPage><Biblioteca /></LazyPage>} />
        <Route path="/rutina" element={<LazyPage><Rutina /></LazyPage>} />
        <Route path="/rutinas" element={<LazyPage><Rutina /></LazyPage>} />
        <Route path="/calendario" element={<LazyPage><Calendario /></LazyPage>} />
        <Route path="/nutricion" element={<LazyPage><Nutricion /></LazyPage>} />
        <Route path="/recuperacion" element={<LazyPage><Recuperacion /></LazyPage>} />
        <Route path="/perfil" element={<LazyPage><Perfil /></LazyPage>} />
      </Routes>
      </div>
      {!hideNav && <AppNav/>}
      {!hideNav && <ChatWidget/>}
      {updateReady && <div className="fixed top-2 left-2 right-2 bg-amber-500 text-black text-sm p-3 rounded-xl text-center">Nueva versión disponible — recargá la app</div>}
      <OnlineBanner/>
    </>
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
  return <div className="fixed top-0 left-0 right-0 bg-slate-800 text-xs text-center py-1 border-b border-slate-700">Modo offline — todo funciona localmente</div>
}

import { applyAppearance } from '@/utils/appearance'

export default function App(){
  const [ready,setReady]=useState(false)
  useEffect(()=>{
    applyAppearance()
    db.open().then(()=>setReady(true))
  },[])
  if(!ready) {return <div className="p-8 text-center">Cargando…</div>}
  return <BrowserRouter><Layout/></BrowserRouter>
}
