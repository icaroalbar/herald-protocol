# @herald/sdk

SDK Node.js de referência para o **Herald Protocol**. Implementa identificação de agentes,
negociação de capacidades, um Policy Engine puro e coleta de métricas — conforme
[RFC-0001](../RFC-0001.md), [ARCHITECTURE.md](../ARCHITECTURE.md) e [HEADERS.md](../HEADERS.md).

> Este projeto se chamava "Agent Interaction Protocol (AIP)" até 2026-08-03, quando foi
> renomeado para evitar colisão com o produto comercial "AIP" da Palantir e com os
> rascunhos IETF/termo acadêmico "Agent (Identity|Interaction) Protocol (AIP)" surgidos em
> 2026 no mesmo espaço de problema. Ver ICA-27 no histórico do projeto.

Este SDK é a camada de baixo nível usada pelo Gateway (Fase 3). Também pode ser usado
diretamente por quem quer integrar o Herald Protocol sem adotar o middleware completo.

## Instalação

```bash
npm install @herald/sdk
```

## Uso básico

### 1. Identificar o agente de uma requisição

```ts
import { identifyAgent } from "@herald/sdk";

const agent = identifyAgent({
  headers: {
    "Herald-Agent-Id": "anthropic-claude/1.0",
    "Herald-Agent-Type": "assistant",
  },
});
// { agentId: "anthropic-claude/1.0", agentType: "assistant", verified: false, source: "herald-header" }
```

Sem headers Herald, o SDK tenta identificar via `User-Agent` contra uma lista de padrões
conhecidos (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot`, etc.) — identificação nesse
caso é sempre `verified: false` e `source: "user-agent-fallback"`.

`identifyAgent` sempre retorna `verified: false` — identificação é síncrona e barata;
verificação criptográfica é um passo separado (assíncrono, pode envolver I/O para resolver
chaves). Ver seção 6 abaixo.

### 2. Negociar formato

```ts
import { parseAcceptCapabilities, negotiateFormat } from "@herald/sdk";

const requested = parseAcceptCapabilities("structured-json;q=1.0, markdown;q=0.8, html;q=0.3");
const { format, matched } = negotiateFormat(requested, ["structured-json", "html"]);
// format: "structured-json", matched: true
```

### 3. Avaliar política de acesso

```ts
import { PolicyEngine, formatPolicyDecisionHeader } from "@herald/sdk";

const policyEngine = new PolicyEngine({
  default: { read: "allow", train: "deny" },
  byAgentType: {
    crawler: { read: "allow", train: "ask", rateLimit: { requests: 10, windowSeconds: 60 } },
  },
  // Agentes não verificados nunca recebem "allow" para treino, mesmo que a regra do
  // tipo diga "ask" — reforça a decisão de design da revisão da Fase 1 (ICA-27).
  unverifiedOverride: { train: "deny" },
});

const decision = policyEngine.evaluate({ agent, resource: "/artigos/exemplo", intent: "train" });
// { intent: "train", result: "deny", rule: "unverified_override.by_agent_type.crawler" }

response.setHeader("Herald-Policy-Decision", formatPolicyDecisionHeader(decision));
```

### 4. Gerar o documento de descoberta (`/.well-known/herald`)

```ts
import { buildDiscoveryDocument } from "@herald/sdk";

const doc = buildDiscoveryDocument({
  origin: "https://example.com",
  capabilities: ["structured-json", "markdown", "html"],
  defaultPolicy: { read: "allow", train: "deny", redistribute: "deny" },
  byAgentType: {
    crawler: { read: "allow", train: "ask", rateLimit: { requests: 10, windowSeconds: 60 } },
  },
  analytics: { reporting: "aggregate", contact: "mailto:agents@example.com" },
});

app.get("/.well-known/herald", (req, res) => res.json(doc));
```

### 5. Coletar métricas

```ts
import { InMemoryMetricsCollector } from "@herald/sdk";

const metrics = new InMemoryMetricsCollector();

metrics.incrementRequest(agent);
metrics.recordPolicyDecision(agent, decision);
metrics.recordFormat(agent, format);
metrics.recordLatency(agent, 42);

console.log(metrics.snapshot());
// { requestsByAgent: {...}, decisionsByResult: {...}, formatsServed: {...}, averageLatencyMs: 42, ... }
```

`InMemoryMetricsCollector` é suficiente para a PoC. Para produção, implemente a interface
`MetricsCollector` com um adaptador para `prom-client` — nenhuma outra parte do SDK precisa
mudar (ver ARCHITECTURE.md §4.4).

### 6. Verificação de identidade (HTTP Message Signatures, RFC 9421)

`identifyAgent` nunca verifica assinatura — só faz parsing de headers. Para tratar um
agente como `verified: true`, assine no lado do agente e verifique no lado da origem com
`signRequest`/`verifyRequestSignature`:

```ts
import { generateSigningKeyPair, signRequest, verifyRequestSignature } from "@herald/sdk";

// Provisionamento (uma vez, fora do hot path)
const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
const keyRegistry = new Map([["anthropic-claude-key-1", publicKeyPem]]);

// Lado do agente: assina a requisição antes de enviar
const signedHeaders = signRequest({
  request: { method: "GET", path: "/artigos/exemplo", authority: "example.com", headers: { "herald-agent-id": "anthropic-claude/1.0" } },
  keyId: "anthropic-claude-key-1",
  alg: "ed25519",
  privateKeyPem,
  expiresInSeconds: 300,
});
// anexar signedHeaders["Signature-Input"] e signedHeaders["Signature"] à requisição real

// Lado da origem: verifica e promove o AgentContext
const agent = identifyAgent({ headers: req.headers });
if (agent.source === "herald-header") {
  const result = await verifyRequestSignature({
    request: { method: req.method, path: req.path, authority: req.headers.host ?? "", headers: req.headers },
    resolvePublicKey: (keyId) => keyRegistry.get(keyId) ?? null,
  });
  agent.verified = result.valid; // AgentContext é um objeto simples — atualizável in-place
}
```

O `@herald/gateway` já integra esse fluxo automaticamente via a opção `signatureVerification`
(ver README do Gateway) — a maioria dos usuários não precisa chamar `verifyRequestSignature`
diretamente.

Suporta `ed25519` (recomendado, via `node:crypto`) e `ecdsa-p256-sha256`. É um subconjunto
prático da RFC 9421 — um único rótulo de assinatura, sem parâmetros de componente — não uma
implementação genérica da especificação completa.

### 7. Monetização do intent `ask` (x402)

Ver [MONETIZATION.md](../MONETIZATION.md) para o fluxo completo. O SDK expõe só os headers
e um ponto de extensão (`PaymentVerifier`) — quem faz a liquidação de verdade é quem
configura o Gateway:

```ts
import { createDemoPaymentVerifier, buildPaymentRequiredHeader, parsePaymentSignatureHeader } from "@herald/sdk";

// createDemoPaymentVerifier() NÃO liquida nada de verdade — só para PoC/testes locais.
// Em produção, implemente PaymentVerifier chamando um facilitator x402 real.
```

O `@herald/gateway` já integra esse fluxo automaticamente via a opção `monetization` (ver
README do Gateway) — a maioria dos usuários não precisa chamar essas funções diretamente.

## Exemplo completo (middleware Express manual)

```ts
import express from "express";
import {
  identifyAgent,
  parseAcceptCapabilities,
  negotiateFormat,
  PolicyEngine,
  formatPolicyDecisionHeader,
  buildDiscoveryDocument,
  InMemoryMetricsCollector,
} from "@herald/sdk";

const app = express();
const metrics = new InMemoryMetricsCollector();

const discoveryDoc = buildDiscoveryDocument({
  origin: "https://example.com",
  capabilities: ["structured-json", "html"],
  defaultPolicy: { read: "allow", train: "deny" },
});

const policyEngine = new PolicyEngine({ default: { read: "allow", train: "deny" } });

app.get("/.well-known/herald", (req, res) => res.json(discoveryDoc));

app.use((req, res, next) => {
  const start = Date.now();
  const agent = identifyAgent({ headers: req.headers as Record<string, string> });
  metrics.incrementRequest(agent);

  const decision = policyEngine.evaluate({ agent, resource: req.path, intent: "read" });
  metrics.recordPolicyDecision(agent, decision);
  res.setHeader("Herald-Policy-Decision", formatPolicyDecisionHeader(decision));

  if (decision.result === "deny") {
    return res.status(403).json({ error: "denied", decision });
  }

  const requested = parseAcceptCapabilities(req.headers["herald-accept-capabilities"] as string | undefined);
  const { format } = negotiateFormat(requested, discoveryDoc.capabilities);
  res.setHeader("Herald-Content-Format", format);
  res.setHeader("Vary", "Herald-Agent-Id, Herald-Accept-Capabilities");
  (req as any).heraldFormat = format;

  res.on("finish", () => {
    metrics.recordFormat(agent, format);
    metrics.recordLatency(agent, Date.now() - start);
    if (res.statusCode >= 400) metrics.recordError(agent, res.statusCode);
  });

  next();
});

app.listen(3000);
```

Este é exatamente o comportamento que o pacote `@herald/gateway` (Fase 3) empacota como
middleware pronto para uso — este exemplo mostra o que ele faz por baixo dos panos.

## Build

```bash
npm install
npm run build   # gera dist/ a partir de src/ (TypeScript, target ES2020, strict)
```

## Testes

```bash
npm test   # node --test dist/**/*.test.js — precisa rodar `npm run build` antes
```

Testes unitários com `node:test` (nativo, sem dependência nova), um arquivo `*.test.ts`
por módulo (`identify.test.ts`, `negotiate.test.ts`, `policy.test.ts`, `signature.test.ts`,
`discovery.test.ts`, `metrics.test.ts`, `monetization.test.ts`). Ver
[`../TESTPLAN.md`](../TESTPLAN.md) para a matriz completa de casos cobertos e o que ainda
não está automatizado (carga, fuzzing).

Nota: os arquivos `*.test.ts` compilam para `dist/` junto com o resto (mesmo `tsconfig`) e
hoje são incluídos em `files` do `package.json` — aceitável enquanto o pacote não é
publicado no npm; antes da publicação formal, vale separar build de testes do build de
distribuição.

## Estrutura

```
sdk/
├── src/
│   ├── types.ts       # tipos centrais (AgentContext, PolicySet, PolicyDecision, ...)
│   ├── identify.ts     # identificação de agentes (RFC-0001 §4)
│   ├── negotiate.ts     # negociação de capacidades/formato (RFC-0001 §5)
│   ├── policy.ts        # Policy Engine (RFC-0001 §8)
│   ├── discovery.ts     # geração do documento /.well-known/herald (RFC-0001 §6)
│   ├── metrics.ts        # coletor de métricas in-memory (RFC-0001 §9)
│   ├── signature.ts       # HTTP Message Signatures / RFC 9421 (RFC-0001 §4.4)
│   ├── monetization.ts     # fluxo de referência x402 para o intent `ask` (MONETIZATION.md)
│   └── index.ts          # exports públicos
├── package.json
├── tsconfig.json
└── README.md
```

## Status

Implementação de referência da Fase 2 do roadmap do Herald Protocol. Ainda não publicado no
npm — uso local via `npm link` ou copiando `dist/` até a publicação formal.
