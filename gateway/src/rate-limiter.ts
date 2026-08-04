import type { RateLimit } from "@herald/sdk";

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Rate limiter de janela fixa, in-memory (RFC-0001 §8.5). Adequado para uma única
 * instância de processo. Para deployments multi-instância, substituir por um backend
 * compartilhado (ex: Redis) implementando a mesma interface pública (`check`).
 */
export class FixedWindowRateLimiter {
  private state = new Map<string, WindowState>();

  /**
   * Retorna `null` se a requisição está dentro do limite (e já a contabiliza), ou o
   * número de segundos até a janela liberar (para o header `Retry-After`) se excedido.
   */
  check(key: string, limit: RateLimit): number | null {
    const now = Date.now();
    const windowMs = limit.windowSeconds * 1000;
    const current = this.state.get(key);

    if (!current || now - current.windowStart >= windowMs) {
      this.state.set(key, { count: 1, windowStart: now });
      return null;
    }

    if (current.count < limit.requests) {
      current.count += 1;
      return null;
    }

    const retryAfterMs = windowMs - (now - current.windowStart);
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }
}
