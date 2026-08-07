import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";
import type { AgentContext, Capability, MetricsCollector, PolicyDecision } from "@herald/sdk";

export interface PrometheusRenderResult {
  contentType: string;
  body: string;
}

/**
 * MetricsCollector do Herald Protocol backed by prom-client — mesma interface que
 * InMemoryMetricsCollector (sdk/src/metrics.ts), reconhecido pelo GET /metrics de
 * @herald/gateway via duck-typing em renderPrometheus() (ver PrometheusRenderableMetrics
 * em gateway/src/gateway.ts) — não precisa @herald/sdk nem @herald/gateway dependerem de
 * prom-client, só quem opta por este pacote.
 *
 * Diferença deliberada do InMemoryMetricsCollector: não usa agentId como label de série.
 * Cardinalidade sem limite de agentId (um valor por bot/versão distinta observada) é
 * anti-padrão conhecido do Prometheus — o TSDB cresce sem limite com uma série nova a
 * cada agente diferente. Agrega só por agentType (5 valores possíveis, RFC-0001 §4) —
 * perde granularidade por agente individual, ganha um TSDB que não explode em produção
 * com tráfego real de bots variados.
 */
export class PrometheusMetricsCollector implements MetricsCollector {
  private readonly registry: Registry;
  private readonly requestsTotal: Counter<string>;
  private readonly decisionsTotal: Counter<string>;
  private readonly formatsTotal: Counter<string>;
  private readonly errorsTotal: Counter<string>;
  private readonly latencyMs: Histogram<string>;

  constructor(registry: Registry = new Registry()) {
    this.registry = registry;
    collectDefaultMetrics({ register: this.registry });

    this.requestsTotal = new Counter({
      name: "herald_requests_total",
      help: "Total de requisições vistas pelo Gateway, por tipo de agente (RFC-0001 §4).",
      labelNames: ["agent_type"],
      registers: [this.registry],
    });
    this.decisionsTotal = new Counter({
      name: "herald_policy_decisions_total",
      help: "Total de decisões do Policy Engine, por resultado (allow/deny/ask/not-applicable).",
      labelNames: ["result"],
      registers: [this.registry],
    });
    this.formatsTotal = new Counter({
      name: "herald_formats_served_total",
      help: "Total de respostas servidas, por formato negociado (Capability).",
      labelNames: ["format"],
      registers: [this.registry],
    });
    this.errorsTotal = new Counter({
      name: "herald_errors_total",
      help: "Total de respostas de erro (status >= 400), por tipo de agente e status code.",
      labelNames: ["agent_type", "status_code"],
      registers: [this.registry],
    });
    this.latencyMs = new Histogram({
      name: "herald_request_duration_ms",
      help: "Latência da requisição em milissegundos, por tipo de agente.",
      labelNames: ["agent_type"],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });
  }

  incrementRequest(agent: AgentContext): void {
    this.requestsTotal.inc({ agent_type: agent.agentType });
  }

  recordPolicyDecision(_agent: AgentContext, decision: PolicyDecision): void {
    this.decisionsTotal.inc({ result: decision.result });
  }

  recordFormat(_agent: AgentContext, format: Capability): void {
    this.formatsTotal.inc({ format });
  }

  recordError(agent: AgentContext, statusCode: number): void {
    this.errorsTotal.inc({ agent_type: agent.agentType, status_code: String(statusCode) });
  }

  recordLatency(agent: AgentContext, ms: number): void {
    this.latencyMs.observe({ agent_type: agent.agentType }, ms);
  }

  /** Reconhecido por GET /metrics de @herald/gateway (duck-typing, ver gateway.ts). */
  async renderPrometheus(): Promise<PrometheusRenderResult> {
    return { contentType: this.registry.contentType, body: await this.registry.metrics() };
  }
}
