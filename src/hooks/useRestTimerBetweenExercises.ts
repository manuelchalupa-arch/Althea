import { usePersistentRestTimer } from '@/hooks/usePersistentRestTimer'

export function useRestTimerBetweenExercises() {
  return usePersistentRestTimer('between-exercises')
}