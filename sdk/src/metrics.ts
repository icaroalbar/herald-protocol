import type { AgentContext, Capability, MetricsCollector, PolicyDecision } from "./types.js";

interface Counter {
  [key: string]: number;
}

/**
 * Coletor de métricas in-memory de referência (RFC-0001 §9). Implementa a interface
 * MetricsCollector — em produção, basta implementar a mesma interface com um adaptador
 * para `prom-client` sem alterar o restante do SDK (ARCHITECTURE.md §4.4).
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private requestsByAgent: Counter = {};
  private decisionsByResult: Counter = {};
  private formatsServed: Counter = {};
  private errorsByAgent: Counter = {};
  private latencies: number[] = [];

  private key(agent: AgentContext): string {
    return agent.agentId ?? `unknown:${agent.agentType}`;
  }

  incrementRequest(agent: AgentContext): void {
    const k = this.key(agent);
    this.requestsByAgent[k] = (this.requestsByAgent[k] ?? 0) + 1;
  }

  recordPolicyDecision(_agent: AgentContext, decision: PolicyDecision): void {
    this.decisionsByResult[decision.result] = (this.decisionsByResult[decision.result] ?? 0) + 1;
  }

  recordFormat(_agent: AgentContext, format: Capability): void {
    this.formatsServed[format] = (this.formatsServed[format] ?? 0) + 1;
  }

  recordError(agent: AgentContext, statusCode: number): void {
    const k = `${this.key(agent)}:${statusCode}`;
    this.errorsByAgent[k] = (this.errorsByAgent[k] ?? 0) + 1;
  }

  recordLatency(_agent: AgentContext, ms: number): void {
    this.latencies.push(ms);
  }

  snapshot() {
    const avgLatency =
      this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0;
    return {
      requestsByAgent: { ...this.requestsByAgent },
      decisionsByResult: { ...this.decisionsByResult },
      formatsServed: { ...this.formatsServed },
      errorsByAgent: { ...this.errorsByAgent },
      averageLatencyMs: avgLatency,
      sampleCount: this.latencies.length,
    };
  }
}
