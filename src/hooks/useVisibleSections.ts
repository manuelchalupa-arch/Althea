import { useEffect, useState } from 'react'

const KEY = 'althea:visible-sections'
const EVENT = 'althea:visible-sections-changed'
const LOCKED = new Set(['home', 'profile', 'more'])

export const TOGGLEABLE_SECTIONS: { icon: string; label: string }[] = [
  { icon: 'training', label: 'Entrenamiento' },
  { icon: 'nutrition', label: 'Nutrición' },
  { icon: 'progress', label: 'Progreso' },
  { icon: 'calendar', label: 'Calendario' },
  { icon: 'library', label: 'Biblioteca' },
  { icon: 'routines', label: 'Rutinas' },
  { icon: 'energy', label: 'Actividad deportiva' },
  { icon: 'recovery', label: 'Recuperación' },
  { icon: 'coach', label: 'Coach y objetivos' },
]

const ALL = [...TOGGLEABLE_SECTIONS.map((s) => s.icon), ...LOCKED]

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) { return new Set(ALL) }
    const arr = JSON.parse(raw) as string[]
    const s = new Set(arr)
    LOCKED.forEach((k) => s.add(k))
    return s
  } catch {
    return new Set(ALL)
  }
}

export function getVisibleSections(): Set<string> {
  return read()
}

export function useVisibleSections() {
  const [visible, setVisible] = useState<Set<string>>(() => read())
  useEffect(() => {
    const sync = () => setVisible(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const toggle = (icon: string) => {
    if (LOCKED.has(icon)) { return }
    const nx = new Set(visible)
    if (nx.has(icon)) { nx.delete(icon) }
    else { nx.add(icon) }
    setVisible(nx)
    try { localStorage.setItem(KEY, JSON.stringify([...nx])) } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent(EVENT))
  }
  const isVisible = (icon: string) => visible.has(icon) || LOCKED.has(icon)
  return { visible, toggle, isVisible }
}
