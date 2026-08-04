import type { AgentContext, AgentType, Intent, PolicyDecision, PolicyResult, PolicySet } from "./types.js";

export interface EvaluateInput {
  agent: AgentContext;
  /** Path da requisição, ex: "/artigos/exemplo" */
  resource: string;
  intent: Intent;
}

export interface ResourcePolicyRule {
  /** Glob simples: suporta apenas sufixo "*", ex: "/artigos/premium/*". */
  pattern: string;
  policies: PolicySet;
}

export interface PolicyEngineConfig {
  default: PolicySet;
  byAgentType?: Partial<Record<AgentType, PolicySet>>;
  byAgentId?: Record<string, PolicySet>;
  byResource?: ResourcePolicyRule[];
  /**
   * Política aplicada quando o agente não passou em verificação de assinatura.
   * Tem precedência sobre a política resolvida normalmente — permite, por exemplo,
   * forçar `ask` para crawlers não verificados mesmo que a regra padrão de `crawler`
   * seja `allow` (decisão registrada em ICA-27 / revisão da Fase 1).
   */
  unverifiedOverride?: PolicySet;
}

function matchesResource(pattern: string, resource: string): boolean {
  if (pattern.endsWith("*")) {
    return resource.startsWith(pattern.slice(0, -1));
  }
  return pattern === resource;
}

/**
 * Policy Engine de referência (RFC-0001 §8). Avaliação pura, sem I/O — segura para uso
 * no hot path de cada requisição. Resolve por ordem de precedência: recurso → agent-id →
 * agent-type → default (RFC-0001 §8.3).
 */
export class PolicyEngine {
  constructor(private readonly config: PolicyEngineConfig) {}

  evaluate(input: EvaluateInput): PolicyDecision {
    const { agent, resource, intent } = input;

    const resourceRule = this.config.byResource?.find((r) => matchesResource(r.pattern, resource));
    if (resourceRule && resourceRule.policies[intent] !== undefined) {
      return this.finalize(intent, resourceRule.policies, `resource.${resourceRule.pattern}`, agent);
    }

    const byAgentIdPolicy = agent.agentId ? this.config.byAgentId?.[agent.agentId] : undefined;
    if (byAgentIdPolicy && byAgentIdPolicy[intent] !== undefined) {
      return this.finalize(intent, byAgentIdPolicy, `by_agent_id.${agent.agentId}`, agent);
    }

    const typePolicy = this.config.byAgentType?.[agent.agentType];
    if (typePolicy && typePolicy[intent] !== undefined) {
      return this.finalize(intent, typePolicy, `by_agent_type.${agent.agentType}`, agent);
    }

    return this.finalize(intent, this.config.default, "default", agent);
  }

  private finalize(intent: Intent, policies: PolicySet, ruleName: string, agent: AgentContext): PolicyDecision {
    let result: PolicyResult = policies[intent] ?? "not-applicable";
    let rule = ruleName;

    const isIdentifiedAgent = agent.source !== "none";
    const override = this.config.unverifiedOverride?.[intent];
    if (isIdentifiedAgent && !agent.verified && override !== undefined) {
      result = override;
      rule = `unverified_override.${ruleName}`;
    }

    return { intent, result, rule, rateLimit: policies.rateLimit };
  }
}

/** Formata a decisão no formato do header Herald-Policy-Decision (RFC-0001 §8.4). */
export function formatPolicyDecisionHeader(decision: PolicyDecision): string {
  return `intent=${decision.intent}; result=${decision.result}; rule=${decision.rule}`;
}
