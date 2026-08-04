# Herald Protocol — Plano de Testes

> Cobre os 4 pacotes da implementação de referência: `@herald/sdk`, `@herald/gateway`,
> `@herald/dashboard`, `@herald/poc`. Complementa (não substitui) [`poc/README.md`](./poc/README.md),
> que descreve a validação e2e manual já existente.

## 1. Estratégia

Pirâmide de testes adotada, do mais barato/rápido ao mais caro/lento:

| Nível | O que cobre | Ferramenta | Status |
|---|---|---|---|
| Unitário | Funções puras do `@herald/sdk` (identificação, negociação, Policy Engine, assinatura, discovery, métricas) | `node:test` + `node:assert/strict` (nativo, zero dependência nova) | Implementado (este documento) |
| Integração | Pipeline do `@herald/gateway` como um todo (Express + SDK), sem servidor HTTP real | `node:test` + `supertest` | Implementado |
| Integração | Agregação `/api/metrics` do `@herald/dashboard` (múltiplos Gateways, um fora do ar) | `node:test` + `supertest`, `fetch` mockado | Implementado |
| E2E / smoke | Servidor real + requisições HTTP reais, os 5 pontos do projeto + verificação de assinatura | Script dedicado (`poc/src/demo.ts`) | Implementado (Fase PoC) |
| CI | Build + testes dos 4 pacotes + smoke e2e da PoC a cada push/PR | GitHub Actions (`.github/workflows/ci.yml`) | Implementado |
| Manual/exploratório | Dashboard (visual), casos de borda não cobertos por automação | Checklist (§6) | Parcial |

Escolha de `node:test` em vez de Jest/Vitest: os pacotes já seguem a filosofia de dependências
mínimas (Gateway só depende de Express; SDK não depende de nada em runtime). `node:test` é
nativo desde Node 18 (`engines` já exige `>=18` em todos os pacotes) e cobre tudo que os
testes unitários aqui precisam — não há motivo para adicionar um test runner externo agora.

## 2. Escopo por pacote

### `@herald/sdk` — prioridade alta (implementado)

É onde vive toda a lógica normativa do protocolo (RFC-0001 §4, §5, §6, §8, §9, a
verificação de assinatura descrita em SIGNATURES.md, e o fluxo de monetização x402
descrito em MONETIZATION.md). Funções puras, sem I/O (exceto `signature.ts`, que usa
`node:crypto` de forma síncrona) — o cenário ideal para teste unitário rápido e
determinístico.

### `@herald/gateway` — prioridade média (implementado)

O pipeline (`gateway.ts`) já era exercitado indiretamente pela PoC (`demo.ts`); agora tem
também testes de integração isolados (`gateway.test.ts`, sem depender do `poc/`), via
`supertest` contra uma instância de `createHeraldGateway()` montada num Express mínimo de
teste: respostas 403/402/429, headers `Vary`/`Herald-Content-Format`/`Herald-Policy-Decision`,
formatter dispatch (incluindo padrões conflitantes e erro propagado via `next(err)`), rate
limit sob concorrência real (requisições em paralelo), verificação de assinatura
(válida/ausente/forjada), o fluxo de monetização x402 (sem `monetization` configurado,
`resolveRequirements` retornando `null`, primeira tentativa sem `Payment-Signature`,
pagamento válido liberando o pipeline, pagamento insuficiente, `Payment-Signature`
malformado — ver MONETIZATION.md), e o caminho de cliente sem headers Herald (idêntico ao
comportamento sem o Gateway).

### `@herald/dashboard` — prioridade baixa (implementado)

Lógica de agregação (`server.ts`) testada com `node:test` + `supertest`, mockando
`globalThis.fetch` diretamente (sem subir Gateways reais nem servidores HTTP extras):
agregação de múltiplos Gateways, um Gateway fora do ar (`fetch` rejeita) não derruba os
demais, Gateway respondendo com status HTTP de erro, resposta sem Gateways configurados, e
serving estático de `public/`. Não cobre o polling do frontend (`app.js`) — isso permanece
no checklist manual (§6), já que é comportamento de navegador, não de servidor.

### `@herald/poc` — coberto pelo script de demo (e2e), não por testes unitários

`poc/src/demo.ts` já cobre os 5 pontos do projeto mais verificação de assinatura e o fluxo
de monetização x402 (10 verificações no total). Não faz sentido duplicar como testes
unitários — é deliberadamente um teste de sistema.

## 3. Matriz de casos de teste — `@herald/sdk`

### 3.1 `identify.ts` (RFC-0001 §4)

| Caso | Entrada | Esperado |
|---|---|---|
| Header Herald válido | `Herald-Agent-Id` + `Herald-Agent-Type` corretos | `source: "herald-header"`, `verified: false` |
| Agent-Type inválido/ausente | `Herald-Agent-Id` válido, `Herald-Agent-Type` ausente | `agentType: "unknown"` |
| Agent-Id malformado | não casa com a gramática (HEADERS.md §2) | cai para fallback User-Agent |
| User-Agent conhecido | `ClaudeBot`, `GPTBot`, etc. | `source: "user-agent-fallback"`, `verified: false` |
| Nenhuma identificação | sem headers relevantes | `source: "none"`, `agentId: null` |
| `extraPatterns` | padrão customizado fornecido | detectado corretamente |
| Case-insensitivity | headers em capitalização variada | resolve igual |
| `isHumanBrowser` | `source: "none"` vs. outros | `true` só para `"none"` |

### 3.2 `negotiate.ts` (RFC-0001 §5)

| Caso | Entrada | Esperado |
|---|---|---|
| q-values explícitos | `"json;q=1.0, html;q=0.3"` | ordenado desc, valores corretos |
| q implícito | `"json"` sem `;q=` | `q=1.0` |
| Maior q em comum | requested ∩ supported não vazio | escolhe o de maior q |
| Empate de q | dois candidatos com mesmo q | desempate pela ordem de `supported` |
| Sem interseção | nenhum candidato em comum | fallback (`html` por default), `matched: false` |
| `q=0` explícito | capacidade com `q=0` | tratada como recusada, nunca escolhida |
| Header vazio/ausente | `undefined` | retorna `[]`, negocia para fallback |

### 3.3 `policy.ts` (RFC-0001 §8)

| Caso | Entrada | Esperado |
|---|---|---|
| Precedência recurso > resto | regra de recurso e de agent-type conflitantes | recurso vence |
| Precedência agent-id > agent-type | ambas definidas para o mesmo intent | agent-id vence |
| Fallback pra default | nenhuma regra mais específica define o intent | usa `default` |
| Intent ausente | nenhuma regra define o intent | `not-applicable` |
| `unverifiedOverride` aplicado | agente identificado, `verified: false`, override define o intent | override vence sobre a regra resolvida |
| `unverifiedOverride` não aplicado a humanos | `source: "none"` | override ignorado (RFC-0001 §9, não é agente) |
| `unverifiedOverride` não aplicado a verificados | `verified: true` | regra normal prevalece |
| Glob de recurso | `/artigos/*` vs. `/artigos/x/y` | prefixo casa corretamente |
| `formatPolicyDecisionHeader` | decisão qualquer | string no formato `intent=...; result=...; rule=...` |

### 3.4 `signature.ts` (RFC-0001 §4.4 / SIGNATURES.md)

| Caso | Esperado |
|---|---|
| Round-trip válido (ed25519) | assina e verifica com sucesso |
| Round-trip válido (ecdsa-p256-sha256) | assina e verifica com sucesso |
| Chave errada (impostor) | `valid: false`, mesmo com `keyid` correto |
| Componente coberto alterado após assinar | `valid: false` (a base mudou, assinatura não bate) |
| `created` fora da janela (`maxAgeSeconds`) | `valid: false`, motivo "expirada" |
| `expires` no passado | `valid: false` |
| `keyid` desconhecido (`resolvePublicKey` retorna `null`) | `valid: false`, motivo explícito |
| `Signature-Input` ausente | `valid: false`, não lança exceção |
| `Signature` malformado (não bate o padrão `:base64:`) | `valid: false`, não lança exceção |
| `generateSigningKeyPair` | retorna PEM válido (SPKI/PKCS8) para ambos os algoritmos |

### 3.5 `monetization.ts` (RFC-0001 §8.2 / MONETIZATION.md)

| Caso | Esperado |
|---|---|
| `buildPaymentRequiredHeader` | base64 de `{x402Version:2, accepts:[requirements]}` |
| `parsePaymentSignatureHeader` — round-trip válido | decodifica de volta o `PaymentPayload` original |
| `parsePaymentSignatureHeader` — header ausente | `null`, não lança exceção |
| `parsePaymentSignatureHeader` — base64/JSON malformado | `null`, não lança exceção |
| `parsePaymentSignatureHeader` — campos obrigatórios ausentes | `null` |
| `buildPaymentResponseHeader` | base64 do `SettlementResponse`, round-trip correto |
| `createDemoPaymentVerifier` — valor suficiente, scheme/network corretos | `success: true`, `transaction` presente |
| `createDemoPaymentVerifier` — valor insuficiente | `success: false`, `errorReason: "valor_insuficiente"` |
| `createDemoPaymentVerifier` — scheme/network não batem | `success: false`, `errorReason: "scheme_ou_network_nao_batem"` |
| `createDemoPaymentVerifier` — payer ausente | `payer: "unknown"` |

### 3.6 `discovery.ts` e `metrics.ts`

| Caso | Esperado |
|---|---|
| `buildDiscoveryDocument` — campos opcionais omitidos | não aparecem no objeto (sem `undefined` residual) |
| `buildDiscoveryDocument` — `rateLimit` → `rate_limit`/`window_seconds` | conversão para snake_case correta |
| `herald_version` default | `"1.0"` quando não especificado |
| `InMemoryMetricsCollector` — contadores por agente | incrementam corretamente por `agentId` |
| `InMemoryMetricsCollector` — latência média | `averageLatencyMs` calculada corretamente sobre as amostras |
| `InMemoryMetricsCollector` — erros | chave `agentId:statusCode` |

## 4. Casos de teste — os 5 pontos do projeto + assinatura (nível e2e, já implementados)

Ver [`poc/README.md`](./poc/README.md) §"O que cada verificação exercita" — os 5 pontos
normativos do Herald Protocol, mais os 2 casos de verificação de assinatura, mais os 3
casos do fluxo de monetização x402 (MONETIZATION.md), já são cobertos por `poc/src/demo.ts`,
rodando contra um servidor real. Este plano não duplica essas verificações como testes
unitários porque elas dependem essencialmente da integração real entre SDK + Gateway +
Express, que é justamente o que o nível e2e existe para cobrir.

## 5. Lacunas conhecidas (não implementado nesta rodada)

- ~~**Teste de carga**~~ — INVESTIGADO (2026-08-04, ICA-30): script
  `gateway/scripts/load-test.mjs` (`npm run load-test` no pacote `gateway`) mede o heap do
  `FixedWindowRateLimiter` e do `InMemoryMetricsCollector` sob volume. Resultado: o `Map`
  do rate limiter e os objetos `requestsByAgent`/`errorsByAgent` do metrics collector
  crescem em função da **cardinalidade de agentes distintos** (10.000 agentes → +2.36 MB,
  ~247 B/agente) — sem eviction/TTL, mas limitado pelo número de agentes únicos já vistos.
  Já o array `InMemoryMetricsCollector.latencies` cresce **sem limite por requisição**,
  independente de agentes distintos (1.000.000 requisições de um único agente → +8.98 MB,
  ~9.4 B/requisição, nunca truncado) — isso É um vazamento de memória real sob volume
  sustentado em produção de longa duração. **Corrigido em ICA-33 (2026-08-04)**: `recordLatency` passou a usar soma+contagem
  incremental em vez de array — memória O(1), média continua exata (não é aproximação),
  confirmado reexecutando o script de carga.
- ~~**Fuzzing dos parsers**~~ — rastreado em ICA-31.

## 6. Checklist manual (Dashboard e exploratório)

- [ ] Dashboard mostra "Sem dados ainda" corretamente quando um Gateway está sem tráfego.
- [ ] Dashboard mostra cartão de erro quando um Gateway configurado está fora do ar,
      sem quebrar a renderização dos outros.
- [ ] Polling do Dashboard realmente atualiza a UI no intervalo configurado
      (`HERALD_POLL_INTERVAL_MS`).
- [ ] `/.well-known/herald` retorna `Content-Type: application/json` e valida contra
      `well-known-herald.schema.json` (conferir manualmente ou com um validador JSON Schema).

## 7. Como rodar

Localmente, pacote por pacote (ordem importa — Gateway/Dashboard/PoC dependem do `dist/`
do SDK já compilado, via `file:../sdk`):

```bash
cd sdk       && npm install && npm run build && npm test
cd ../gateway && npm install && npm run build && npm test
cd ../dashboard && npm install && npm run build && npm test
cd ../poc     && npm install && npm run build
# em um terminal: npm start   |   em outro: npm run demo
```

Em CI (`.github/workflows/ci.yml`), os quatro pacotes são buildados/testados nessa mesma
ordem a cada push/PR para `main`, incluindo o smoke e2e da PoC (servidor sobe em background,
`npm run demo` roda contra ele).

## 8. Critério de "pronto"

Este plano considera a Fase de Testes minimamente cumprida quando:

1. Os testes unitários do `@herald/sdk` (§3) passam limpos (`npm test`).
2. Os testes de integração do `@herald/gateway` e `@herald/dashboard` passam limpos (`npm test`).
3. O script e2e da PoC (§4) passa 100% (`npm run demo` → N/N).
4. O workflow de CI passa verde a cada push.
5. As lacunas do §5 estão registradas (não escondidas) — este documento cumpre esse papel.

Cobertura de código (%) não é usada como critério aqui — os módulos testados são pequenos
e a cobertura por *caso de uso normativo do RFC* (tabelas acima) é mais informativa que uma
métrica de linhas cobertas.
