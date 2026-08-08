# @heraldserver/gateway

Gateway de referência para o **Herald Protocol** — um middleware Express que aplica
identificação de agentes, negociação de capacidades, Policy Engine e rate limiting a
qualquer aplicação existente, sem exigir reescrita de rotas.

Depende de [`@heraldserver/sdk`](../sdk) para toda a lógica de protocolo; o Gateway apenas
orquestra o pipeline por requisição e expõe os endpoints padrão (`/.well-known/herald`,
`/metrics`).

## Instalação

```bash
# a partir da raiz do repositório
cd sdk && npm install && npm run build   # o Gateway depende do build do SDK
cd ../gateway && npm install && npm run build
```

`@heraldserver/sdk` é referenciado via `file:../sdk` no `package.json` — não precisa estar
publicado no npm para desenvolvimento local.

## Pipeline por requisição

```
1. identifyAgent(headers)                            → AgentContext
2. cliente sem identificação (source="none")          → next() imediato, comportamento inalterado
3. policyEngine.evaluate({ agent, resource, read })   → PolicyDecision
4. decision.result === "deny"                         → 403 + Herald-Policy-Decision
5. decision.result === "ask"                          → 402 + Herald-Policy-Decision
                                                          (com `monetization` configurado: fluxo x402, ver abaixo)
6. decision.rateLimit definido e excedido             → 429 + Retry-After
7. negotiateFormat(Herald-Accept-Capabilities, ...)   → { format, matched }
8. formatter registrado para (recurso, formato)?      → responde direto (200 + JSON)
   caso contrário                                     → next(), app lê getHeraldContext(req)
9. em res.on("finish")                                → métricas (latência, formato, erros)
```

Este pipeline implementa diretamente a sequência descrita em
[ARCHITECTURE.md §3.1](../ARCHITECTURE.md#31-sequência-de-negociação) e os casos de borda
normativos de [HEADERS.md §6](../HEADERS.md#6-casos-de-borda-normativos).

## Uso básico

```ts
import express from "express";
import { createHeraldGateway } from "@heraldserver/gateway";

const app = express();

const gateway = createHeraldGateway({
  discovery: {
    origin: "https://example.com",
    capabilities: ["structured-json", "html"],
    defaultPolicy: { read: "allow", train: "deny", redistribute: "deny" },
    byAgentType: {
      crawler: { read: "allow", train: "ask", rateLimit: { requests: 10, windowSeconds: 60 } },
      assistant: { read: "allow", train: "deny" },
    },
    analytics: { reporting: "aggregate", contact: "mailto:agents@example.com" },
  },
  policy: {
    default: { read: "allow", train: "deny" },
    byAgentType: {
      crawler: { read: "allow", train: "ask", rateLimit: { requests: 10, windowSeconds: 60 } },
    },
    // Agentes não verificados nunca herdam "ask" para treino — vira "deny" direto
    // (decisão de design da revisão da Fase 1, registrada em ICA-27).
    unverifiedOverride: { train: "deny" },
  },
});

// Formatter opcional: responde direto em JSON estruturado para /artigos/*
gateway.formatters.register("/artigos/*", "structured-json", async (req) => {
  const artigo = await getArtigoPorPath(req.path); // mesma fonte de dados do HTML
  return { title: artigo.title, body: artigo.body, publishedAt: artigo.publishedAt };
});

app.use(gateway.router);

// Rotas normais da aplicação — humanos e agentes sem formatter registrado passam por aqui
app.get("/artigos/*", (req, res) => {
  res.send(renderHtml(req.path));
});

app.listen(3000);
```

`/.well-known/herald` e `/metrics` já ficam disponíveis automaticamente ao montar
`gateway.router`.

## Lendo o contexto Herald em rotas downstream

Quando não há formatter registrado, a aplicação decide como responder — mas pode
consultar o que o Gateway já resolveu:

```ts
import { getHeraldContext } from "@heraldserver/gateway";

app.get("/artigos/:slug", (req, res) => {
  const ctx = getHeraldContext(req);
  if (ctx?.format === "structured-json") {
    return res.json(buildStructuredArticle(req.params.slug));
  }
  res.send(renderHtml(req.params.slug));
});
```

## Verificação de identidade (assinatura de requisições)

Sem configuração adicional, todo agente é `verified: false` (identidade autodeclarada).
Para exigir e validar assinaturas RFC 9421 (RFC-0001 §4.4), passe `signatureVerification`:

```ts
const gateway = createHeraldGateway({
  discovery: { /* ... */ },
  policy: {
    default: { read: "allow" },
    // só concede leitura de recursos sensíveis a agentes com assinatura válida
    byResource: [{ pattern: "/interno/*", policies: { read: "ask" } }],
    unverifiedOverride: { read: "ask" },
  },
  signatureVerification: {
    resolvePublicKey: (keyId) => keyRegistry.get(keyId) ?? null, // seu registro de chaves
    maxAgeSeconds: 300, // default
  },
});
```

Requisições de agentes (`Herald-Agent-Id` presente) com headers `Signature-Input`/`Signature`
válidos (assinados com `signRequest` do `@heraldserver/sdk`) têm `agent.verified` promovido para
`true` antes da avaliação de política — o que faz `unverifiedOverride` diferenciar de fato
os dois casos. Toda resposta a um agente identificado também ganha o header de diagnóstico
`X-Herald-Debug-Agent-Verified: true|false` (não normativo, só para observabilidade).

## Monetização do intent `ask` (x402)

Sem configuração adicional, `ask` responde `402` só com a decisão de política (como
sempre). Para habilitar o fluxo de referência x402 (ver [MONETIZATION.md](../MONETIZATION.md)),
passe `monetization`:

```ts
import { createDemoPaymentVerifier } from "@heraldserver/sdk";

const gateway = createHeraldGateway({
  discovery: { /* ... */ },
  policy: {
    default: { read: "allow" },
    byResource: [{ pattern: "/artigos/relatorio-premium", policies: { read: "ask" } }],
  },
  monetization: {
    resolveRequirements: ({ resource }) =>
      resource === "/artigos/relatorio-premium"
        ? { scheme: "exact", network: "base-sepolia", maxAmountRequired: "1000", asset: "0xUSDC", payTo: "0x...", resource }
        : null, // null preserva o 402 "puro" — ask continua sendo aprovação fora de banda
    verifier: createDemoPaymentVerifier(), // trocar por um PaymentVerifier real em produção
  },
});
```

Na primeira tentativa (sem `Payment-Signature`), o Gateway responde `402` com o header
`Payment-Required`. O agente decodifica, monta um pagamento, e reenvia com
`Payment-Signature`; se `verifier.verify()` confirmar liquidação, a requisição segue o
pipeline normalmente a partir dali (rate limit, negociação de formato, formatter/next()) —
como se a decisão fosse `allow`. `createDemoPaymentVerifier()` não faz liquidação real,
serve só para a PoC/testes locais.

## Rate limiting

O `FixedWindowRateLimiter` é in-memory, por processo — adequado para a PoC e para uma
única instância. Para múltiplas instâncias, substitua por um backend compartilhado (ex:
Redis) implementando a mesma interface `check(key, limit): number | null`.

## Métricas

`gateway.metrics` é um `InMemoryMetricsCollector` do `@heraldserver/sdk` por padrão. A rota
`GET /metrics` expõe `metrics.snapshot()` como JSON — consumido pelo Dashboard Agent
Analytics (Fase 4). Para produção, passe seu próprio `MetricsCollector` (ex: adaptador
`prom-client`) via `createHeraldGateway({ metrics: meuColetor, ... })`.

## Testes

```bash
npm run build
npm test   # node --test dist/**/*.test.js
```

Testes de integração (`gateway.test.ts`) com `node:test` + `supertest`, montando
`createHeraldGateway()` num Express mínimo (sem depender do `poc/`): respostas 403/402/429,
headers `Vary`/`Herald-Content-Format`/`Herald-Policy-Decision`, formatter dispatch (incluindo
padrões conflitantes e erro propagado via `next(err)`), rate limit sob concorrência real
(requisições em paralelo, não sequenciais), verificação de assinatura (válida/ausente/
forjada), e o fluxo de monetização x402 (sem `monetization`, `resolveRequirements` nulo,
primeira tentativa sem pagamento, pagamento válido/insuficiente/malformado). Ver
[`../TESTPLAN.md`](../TESTPLAN.md) §2 e §5.

## Estrutura

```
gateway/
├── src/
│   ├── gateway.ts       # createHeraldGateway() — pipeline principal
│   ├── gateway.test.ts   # testes de integração (supertest)
│   ├── formatters.ts      # FormatterRegistry
│   ├── rate-limiter.ts     # FixedWindowRateLimiter
│   ├── context.ts           # getHeraldContext/setHeraldContext
│   └── index.ts               # exports públicos
├── package.json
├── tsconfig.json
└── README.md
```

## Status

Implementação de referência da Fase 3 do roadmap do Herald Protocol. Publicado no npm como
[`@heraldserver/gateway`](https://www.npmjs.com/package/@heraldserver/gateway).
