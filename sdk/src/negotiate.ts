import type { Capability, CapabilityPreference, NegotiationResult } from "./types.js";

/**
 * Parseia o header Herald-Accept-Capabilities (RFC-0001 §5.1), sintaxe equivalente à do
 * header `Accept` HTTP padrão. Ex: "structured-json;q=1.0, markdown;q=0.8, html;q=0.3"
 */
export function parseAcceptCapabilities(headerValue: string | undefined): CapabilityPreference[] {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [cap, ...params] = part.split(";").map((s) => s.trim());
      let q = 1.0;
      for (const param of params) {
        const match = /^q=([0-9.]+)$/.exec(param);
        if (match) q = parseFloat(match[1]);
      }
      return { capability: cap as Capability, q };
    })
    .sort((a, b) => b.q - a.q);
}

/**
 * Seleciona o formato de maior `q` presente também na lista suportada pela origem.
 * Empates são resolvidos pela ordem de preferência declarada pela origem (`supported`).
 * Sem interseção, cai no fallback (default "html") com matched=false — a origem MUST
 * servir a representação padrão em vez de falhar a requisição (RFC-0001 §5.4.5).
 */
export function negotiateFormat(
  requested: CapabilityPreference[],
  supported: Capability[],
  fallback: Capability = "html"
): NegotiationResult {
  const supportedSet = new Set(supported);
  const candidates = requested.filter((r) => r.q > 0 && supportedSet.has(r.capability));

  if (candidates.length === 0) {
    return { format: fallback, matched: false };
  }

  const maxQ = Math.max(...candidates.map((c) => c.q));
  const tied = candidates.filter((c) => c.q === maxQ);

  if (tied.length === 1) {
    return { format: tied[0].capability, matched: true };
  }

  for (const cap of supported) {
    if (tied.some((t) => t.capability === cap)) {
      return { format: cap, matched: true };
    }
  }

  return { format: tied[0].capability, matched: true };
}
