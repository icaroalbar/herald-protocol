import type { DiscoveryDocumentConfig, PolicySet } from "./types.js";

/**
 * Gera o documento de descoberta servido em GET /.well-known/herald (RFC-0001 §6),
 * validável contra ./well-known-herald.schema.json (na raiz do repositório).
 */
export function buildDiscoveryDocument(config: DiscoveryDocumentConfig) {
  return {
    herald_version: config.heraldVersion ?? "1.0",
    origin: config.origin,
    capabilities: config.capabilities,
    ...(config.endpoints ? { endpoints: config.endpoints } : {}),
    policies: {
      default: toWireFormat(config.defaultPolicy),
      ...(config.byAgentType ? { by_agent_type: mapValues(config.byAgentType, toWireFormat) } : {}),
      ...(config.byAgentId ? { by_agent_id: mapValues(config.byAgentId, toWireFormat) } : {}),
    },
    ...(config.analytics ? { analytics: config.analytics } : {}),
    ...(config.extensions ? { extensions: config.extensions } : {}),
  };
}

function toWireFormat(policySet: PolicySet) {
  return {
    ...(policySet.read !== undefined ? { read: policySet.read } : {}),
    ...(policySet.train !== undefined ? { train: policySet.train } : {}),
    ...(policySet.redistribute !== undefined ? { redistribute: policySet.redistribute } : {}),
    ...(policySet.monetize !== undefined ? { monetize: policySet.monetize } : {}),
    ...(policySet.rateLimit
      ? {
          rate_limit: {
            requests: policySet.rateLimit.requests,
            window_seconds: policySet.rateLimit.windowSeconds,
          },
        }
      : {}),
  };
}

function mapValues<T, R>(obj: Record<string, T>, fn: (v: T) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
