import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'

type ProfileState = {
  profile: UserProfile | null
  setProfile: (p: UserProfile) => void
  hydrationToday: number
  addWater: (ml: number) => void
}

export const useProfileStore = create<ProfileState>()(persist(
  (set, get) => ({
    profile: null,
    setProfile: (profile) => set({ profile }),
    hydrationToday: 0,
    addWater: (ml) => set({ hydrationToday: get().hydrationToday + ml })
  }),
  { name: 'trainpwa-profile' }
))
