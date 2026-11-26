export declare function resetConcurrency(): void
export declare function acquireSlot(
  env: { RATE_LIMITER?: { getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> } } },
  max: number,
  ttlMs: number,
): Promise<{ ok: boolean; id: string | null; mode: string }>
export declare function releaseSlot(
  env: { RATE_LIMITER?: { getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> } } },
  slot: { ok: boolean; id: string | null; mode: string } | null,
): Promise<void>
