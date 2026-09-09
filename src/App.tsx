import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import BottomNav from '@/components/layout/BottomNav'
import Inicio from '@/pages/Inicio'
import Entrenar from '@/pages/Entrenar'
import Progresos from '@/pages/Progreso'
import Coach from '@/pages/Coach'
import Mas from '@/pages/Mas'
import Onboarding from '@/pages/Onboarding'
import Biblioteca from '@/pages/Biblioteca'
import Rutina from '@/pages/Rutina'
import Calendario from '@/pages/Calendario'
import Nutricion from '@/pages/Nutricion'
import Recuperacion from '@/pages/Recuperacion'
import Perfil from '@/pages/Perfil'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/services/storage/db'

function Layout(){
  const loc = useLocation()
  const navigate = useNavigate()
  const hideNav = loc.pathname==='/onboarding'
  const [updateReady,setUpdateReady]=useState(false)
  useEffect(()=>{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=> setUpdateReady(true))
    }
    db.userProfile.get('me').then(p=>{
      const needsOnboarding = !p?.onboardingDone || !(p as any)?.email
      if(needsOnboarding && loc.pathname!=='/onboarding'){
        navigate('/onboarding', { replace: true })
      }
    })
  },[loc.pathname])
  return (
    <>
      <Routes>
        <Route path="/" element={<Inicio/>} />
        <Route path="/entrenar" element={<Entrenar/>} />
        <Route path="/progresos" element={<Progresos/>} />
        <Route path="/progreso" element={<Progresos/>} />
        <Route path="/coach" element={<Coach/>} />
        <Route path="/mas" element={<Mas/>} />
        <Route path="/onboarding" element={<Onboarding/>} />
        <Route path="/biblioteca" element={<Biblioteca/>} />
        <Route path="/rutina" element={<Rutina/>} />
        <Route path="/rutinas" element={<Rutina/>} />
        <Route path="/calendario" element={<Calendario/>} />
        <Route path="/nutricion" element={<Nutricion/>} />
        <Route path="/recuperacion" element={<Recuperacion/>} />
        <Route path="/perfil" element={<Perfil/>} />
      </Routes>
      {!hideNav && <BottomNav/>}
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
  if(online) return null
  return <div className="fixed top-0 left-0 right-0 bg-slate-800 text-xs text-center py-1 border-b border-slate-700">Modo offline — todo funciona localmente</div>
}

export default function App(){
  const [ready,setReady]=useState(false)
  useEffect(()=>{
    db.open().then(()=>setReady(true))
  },[])
  if(!ready) return <div className="p-8 text-center">Cargando…</div>
  return <BrowserRouter><Layout/></BrowserRouter>
}
