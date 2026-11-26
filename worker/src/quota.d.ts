export declare const DEFAULT_DAILY_NEURON_BUDGET: number
export declare function estimateNeurons(
  messages: Array<{ content: string }>,
  maxCompletionTokens: number,
): number
export declare function utcDayKey(nowMs?: number): string
export declare function secondsUntilUtcMidnight(nowMs?: number): number
export declare function reserveDailyNeurons(
  env: {
    RATE_LIMIT?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> }
    RATE_LIMITER?: { getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> } }
    AI_DAILY_NEURON_BUDGET?: string
  },
  cost: number,
  nowMs?: number,
): Promise<{ ok: boolean; limit: number; remaining: number; resetSeconds: number; degraded: boolean; mode: string }>
