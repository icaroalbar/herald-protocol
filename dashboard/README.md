# @herald/dashboard

Dashboard Agent Analytics de referência para o **Herald Protocol**.
Consulta o endpoint `GET /metrics` de um ou mais [`@herald/gateway`](../gateway) e exibe,
por origem: requisições por agente, decisões do Policy Engine, formatos servidos, erros e
latência média.

Optamos por Express + HTML/JS estático (sem framework de frontend) em vez de Next.js —
mais simples de rodar e de auditar para uma PoC, sem passo de build no cliente. A troca
por um frontend mais rico é possível depois sem alterar o contrato de `/api/metrics`.

## Por que um servidor, e não o navegador consultando o Gateway direto?

O `/api/metrics` do Dashboard faz o fetch aos Gateways **no servidor**, não no navegador.
Isso evita configurar CORS em cada Gateway e permite agregar múltiplas origens numa única
tela (ARCHITECTURE.md §2.1: "Desacoplado do Gateway — pode agregar métricas de múltiplas
origens").

## Instalação

```bash
cd dashboard
npm install
npm run build
```

Não depende do `@herald/sdk` nem do `@herald/gateway` em tempo de build — só consome o JSON
que o Gateway já expõe publicamente em `/metrics`.

## Configuração

Variáveis de ambiente (todas opcionais):

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `4000` | Porta em que o Dashboard roda |
| `HERALD_GATEWAYS` | `default=http://localhost:3000/metrics` | Lista `nome=url,nome=url` de Gateways a consultar |
| `HERALD_POLL_INTERVAL_MS` | `5000` | Intervalo de atualização do frontend, em ms |

Exemplo com dois Gateways:

```bash
HERALD_GATEWAYS="blog=http://localhost:3000/metrics,docs=http://localhost:3001/metrics" \
PORT=4000 \
npm start
```

## Uso

```bash
npm start
# Herald Dashboard rodando em http://localhost:4000
```

Abra `http://localhost:4000` no navegador. A página faz polling de `/api/metrics` no
intervalo configurado e re-renderiza os cartões por Gateway.

## Endpoint interno

`GET /api/metrics` retorna:

```json
{
  "fetchedAt": "2026-08-02T23:15:00.000Z",
  "pollIntervalMs": 5000,
  "gateways": [
    {
      "name": "blog",
      "ok": true,
      "data": {
        "requestsByAgent": { "anthropic-claude/1.0": 42 },
        "decisionsByResult": { "allow": 40, "deny": 2 },
        "formatsServed": { "structured-json": 38, "html": 4 },
        "errorsByAgent": {},
        "averageLatencyMs": 12.4,
        "sampleCount": 42
      }
    },
    { "name": "docs", "ok": false, "error": "HTTP 502" }
  ]
}
```

Gateways indisponíveis não derrubam o Dashboard — aparecem como cartão de erro.

## Testes

```bash
npm run build
npm test   # node --test dist/**/*.test.js
```

Testes com `node:test` + `supertest`, mockando `globalThis.fetch` (sem subir Gateways
reais): agregação de múltiplos Gateways, um Gateway fora do ar não derruba os demais,
Gateway respondendo com status HTTP de erro, resposta sem Gateways configurados, e
serving estático de `public/`. Ver [`../TESTPLAN.md`](../TESTPLAN.md) §2 e §5.

## Estrutura

```
dashboard/
├── src/
│   ├── config.ts    # carrega config via env
│   ├── server.ts     # Express: static + agregador /api/metrics
│   ├── server.test.ts # testes de integração (supertest + fetch mockado)
│   └── index.ts        # entry point
├── public/
│   ├── index.html
│   ├── app.js            # polling + renderização (vanilla JS, sem build)
│   └── styles.css
├── package.json
├── tsconfig.json
└── README.md
```

## Limitações conhecidas (PoC)

- Sem autenticação — não exponha publicamente sem colocar atrás de um proxy autenticado.
- Métricas do Gateway são in-memory e resetam a cada restart (mesma limitação do
  `InMemoryMetricsCollector` do `@herald/sdk`); para histórico persistente, troque o
  `MetricsCollector` do Gateway por um adaptador com storage (ex: Prometheus + Grafana).

## Status

Implementação de referência da Fase 4 do roadmap do Herald Protocol.
