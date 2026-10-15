import { usePersistentRestTimer } from '@/hooks/usePersistentRestTimer'

export function useRestTimer() {
  return usePersistentRestTimer('between-sets')
}