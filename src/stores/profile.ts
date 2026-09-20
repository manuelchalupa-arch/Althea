import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'

type ProfileState = {
  profile: UserProfile | null
  setProfile: (p: UserProfile) => void
  /** Caché UI derivada de Dexie `hydrationLogs`. La fuente canónica es Dexie. */
  hydrationToday: number
  addWater: (ml: number) => void
  /** Sincroniza la caché con el total canónico de Dexie (usar al montar). */
  setHydrationToday: (ml: number) => void
}

export const useProfileStore = create<ProfileState>()(persist(
  (set, get) => ({
    profile: null,
    setProfile: (profile) => set({ profile }),
    hydrationToday: 0,
    addWater: (ml) => set({ hydrationToday: get().hydrationToday + ml }),
    setHydrationToday: (ml) => set({ hydrationToday: ml })
  }),
  { name: 'trainpwa-profile' }
))
