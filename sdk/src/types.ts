/**
 * Herald SDK — Core Types
 * Espelha RFC-0001 §4, §5, §6, §8 e ARCHITECTURE.md §5.
 */

export type AgentType = "assistant" | "crawler" | "autonomous" | "search-index" | "unknown";

/** Capacidades conhecidas nativamente; strings customizadas também são aceitas (extensibilidade, RFC-0001 §10.3). */
export type Capability = "structured-json" | "markdown" | "html" | "streaming" | "graphql" | (string & {});

export type Intent = "read" | "train" | "redistribute" | "monetize";

export type PolicyResult = "allow" | "deny" | "ask" | "not-applicable";

export interface AgentContext {
  agentId: string | null;
  agentType: AgentType;
  /** true somente após verificação criptográfica (RFC-0001 §4.4). false por padrão. */
  verified: boolean;
  source: "herald-header" | "user-agent-fallback" | "none";
}

export interface RateLimit {
  requests: number;
  windowSeconds: number;
}

export interface PolicySet {
  read?: PolicyResult;
  train?: PolicyResult;
  redistribute?: PolicyResult;
  monetize?: PolicyResult;
  rateLimit?: RateLimit;
}

export interface PolicyDecision {
  intent: Intent;
  result: PolicyResult;
  /** Caminho legível da regra aplicada, ex: "by_agent_type.crawler" */
  rule: string;
  rateLimit?: RateLimit;
}

export interface CapabilityPreference {
  capability: Capability;
  q: number;
}

export interface NegotiationResult {
  format: Capability;
  /** false quando nenhuma capacidade em comum foi encontrada e caiu no fallback (RFC-0001 §5.4.5) */
  matched: boolean;
}

export interface DiscoveryDocumentConfig {
  heraldVersion?: string; // default "1.0"
  origin: string;
  capabilities: Capability[];
  endpoints?: Record<string, string>;
  defaultPolicy: PolicySet;
  byAgentType?: Partial<Record<AgentType, PolicySet>>;
  byAgentId?: Record<string, PolicySet>;
  analytics?: {
    reporting: "none" | "aggregate";
    contact?: string;
  };
  extensions?: Record<string, unknown>;
}

export interface MetricsCollector {
  incrementRequest(agent: AgentContext): void;
  recordPolicyDecision(agent: AgentContext, decision: PolicyDecision): void;
  recordFormat(agent: AgentContext, format: Capability): void;
  recordError(agent: AgentContext, statusCode: number): void;
  recordLatency(agent: AgentContext, ms: number): void;
}
