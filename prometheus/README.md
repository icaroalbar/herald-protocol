# @herald/prometheus

`MetricsCollector` do Herald Protocol backed by [`prom-client`](https://github.com/siimon/prom-client)
— expõe `GET /metrics` (via `@herald/gateway`) em formato de texto Prometheus/OpenMetrics
em vez do JSON default do `InMemoryMetricsCollector`.

Pacote opcional, separado — `@herald/sdk` e `@herald/gateway` não dependem de
`prom-client` (filosofia de dependência mínima do projeto). Só quem instala e usa este
pacote traz `prom-client` como dependência real.

## Uso

```ts
import { createHeraldGateway } from "@herald/gateway";
import { PrometheusMetricsCollector } from "@herald/prometheus";

const gateway = createHeraldGateway({
  discovery: { /* ... */ },
  policy: { /* ... */ },
  metrics: new PrometheusMetricsCollector(),
});

app.use(gateway.router);
// GET /metrics agora responde texto Prometheus (Content-Type: text/plain; version=...),
// não o JSON do InMemoryMetricsCollector — @herald/gateway reconhece isso via
// renderPrometheus() (duck-typing, sem @herald/gateway depender de prom-client).
```

Aponte um `scrape_configs` do Prometheus pra esse `/metrics` normalmente.

## Métricas expostas

| Nome | Tipo | Labels | Origem |
|---|---|---|---|
| `herald_requests_total` | Counter | `agent_type` | `incrementRequest` |
| `herald_policy_decisions_total` | Counter | `result` | `recordPolicyDecision` |
| `herald_formats_served_total` | Counter | `format` | `recordFormat` |
| `herald_errors_total` | Counter | `agent_type`, `status_code` | `recordError` |
| `herald_request_duration_ms` | Histogram | `agent_type` | `recordLatency` |

Mais as métricas default do Node.js (`collectDefaultMetrics` do `prom-client` — heap, event
loop lag, GC, etc.), num `Registry` próprio por instância (não polui o registry global do
`prom-client` — seguro instanciar mais de um `PrometheusMetricsCollector` no mesmo processo).

## Por que sem `agent_id` como label

`InMemoryMetricsCollector` (o default, em `@herald/sdk`) agrega por `agentId` — cabe bem
num objeto JS em memória, descartado a cada restart. Prometheus é diferente: cada
combinação nova de valores de label vira uma série nova, permanente no TSDB até expirar
pela retenção configurada. `agentId` é essencialmente ilimitado (uma string por
bot/versão distinta observada, ex: `"gptbot/4.2.1"`, `"gptbot/4.2.2"`, ...) — usá-lo como
label é o anti-padrão de "cardinalidade sem limite" documentado pelo próprio Prometheus,
e derruba instâncias reais com tráfego de bots variado. Este pacote agrega só por
`agent_type` (5 valores possíveis — RFC-0001 §4) — perde granularidade por agente
individual (ainda disponível via `outpost_reports` no `@herald/server`, se precisar),
ganha um TSDB que não cresce sem controle.

## Testes

```bash
npm install && npm run build && npm test
```

Sem dependência externa (Postgres, rede) — testes rodam contra `Registry` do próprio
`prom-client`, in-process.
