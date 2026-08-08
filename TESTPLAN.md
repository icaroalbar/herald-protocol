# Herald Protocol — Plano de Testes

> Cobre os 8 pacotes testados da implementação de referência: `@heraldserver/sdk`,
> `@heraldserver/outpost`, `@heraldserver/gateway`, `@herald/dashboard`,
> `@heraldserver/server`, `@heraldserver/cli`, `@heraldserver/prometheus`, `@herald/poc`
> (`@herald/docs` não tem testes automatizados — é o site de documentação). Complementa
> (não substitui) [`poc/README.md`](./poc/README.md), que descreve a validação e2e manual
> já existente.

## 1. Estratégia

Pirâmide de testes adotada, do mais barato/rápido ao mais caro/lento:

| Nível | O que cobre | Ferramenta | Status |
|---|---|---|---|
| Unitário | Funções puras do `@heraldserver/sdk` (identificação, negociação, Policy Engine, assinatura, discovery, métricas) | `node:test` + `node:assert/strict` (nativo, zero dependência nova) | Implementado (este documento) |
| Unitário | `createOutpostReporter`/`assertSecureServerUrl` do `@heraldserver/outpost` — `fetchImpl` injetável, sem rede real | `node:test` | Implementado |
| Integração | Pipeline do `@heraldserver/gateway` como um todo (Express + SDK), sem servidor HTTP real | `node:test` + `supertest` | Implementado |
| Integração | Agregação `/api/metrics` do `@herald/dashboard` (múltiplos Gateways, um fora do ar) | `node:test` + `supertest`, `fetch` mockado | Implementado |
| Integração | `PgOutpostStore`/`PgReportsStore`/rota de push do `@heraldserver/server`, contra Postgres real | `node:test` + `supertest`, banco efêmero por arquivo de teste | Implementado |
| Integração | Comandos do `@heraldserver/cli` (`configure`/`outpost create/ls/inspect/stop/start/rm/prune`), contra Postgres real via `@heraldserver/server` | `node:test`, banco efêmero por arquivo de teste | Implementado |
| Unitário | `PrometheusMetricsCollector` do `@heraldserver/prometheus` — contadores/histograma por `agent_type`, sem `agentId` como label | `node:test`, `Registry` do próprio `prom-client` (sem infra externa) | Implementado |
| E2E / smoke | Servidor real + requisições HTTP reais, os 5 pontos do projeto + verificação de assinatura | Script dedicado (`poc/src/demo.ts`) | Implementado (Fase PoC) |
| CI | Build + testes dos 7 pacotes testáveis + smoke e2e da PoC a cada push/PR, com Postgres real (`services:`) | GitHub Actions (`.github/workflows/ci.yml`) | Implementado |
| Manual/exploratório | Dashboard (visual), casos de borda não cobertos por automação | Checklist (§6) | Parcial |

Escolha de `node:test` em vez de Jest/Vitest: os pacotes já seguem a filosofia de dependências
mínimas (Gateway só depende de Express; SDK não depende de nada em runtime). `node:test` é
nativo desde Node 18 (`engines` já exige `>=18` em todos os pacotes) e cobre tudo que os
testes unitários aqui precisam — não há motivo para adicionar um test runner externo agora.

## 2. Escopo por pacote

### `@heraldserver/sdk` — prioridade alta (implementado)

É onde vive toda a lógica normativa do protocolo (RFC-0001 §4, §5, §6, §8, §9, a
verificação de assinatura descrita em SIGNATURES.md, e o fluxo de monetização x402
descrito em MONETIZATION.md). Funções puras, sem I/O (exceto `signature.ts`, que usa
`node:crypto` de forma síncrona) — o cenário ideal para teste unitário rápido e
determinístico.

### `@heraldserver/outpost` — prioridade alta (implementado)

Cliente de push de métricas (fluxo Outpost) — extraído do `@heraldserver/sdk` em
2026-08-08 (pacote separado, zero dependência de runtime, mesmo espírito do
`@heraldserver/prometheus`: quem só quer reportar métricas não precisa puxar
identificação/negociação/Policy Engine/assinatura junto). Testes usam `fetchImpl`
injetável, sem rede real: `createOutpostReporter` lança sincronamente com
`serverUrl`/`outpostKey` vazios, `assertSecureServerUrl` (HTTPS obrigatório fora de
loopback, `allowInsecureHttp` como escape hatch — mesma checagem que `cli/src/index.ts`
importa direto deste pacote agora, removendo uma duplicação que existia antes),
`reportOnce()` nunca lança mesmo com `fetch` rejeitando, `start()`/`start()` idempotente,
`stop()` interrompe de verdade (sem chamada residual depois).

### `@heraldserver/gateway` — prioridade média (implementado)

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

### `@heraldserver/server` — prioridade alta (implementado)

Control plane opcional (Outpost), backed by Postgres — `PgOutpostStore`, `PgReportsStore`
e a rota HTTP de push (`push-routes.ts`) testados com `node:test` contra um banco
Postgres **real e efêmero** (`test-db.ts` cria um banco novo por arquivo de teste,
`herald_test_<random>`, roda a migration, derruba no final — mesmo espírito de isolamento
que `fs.mkdtempSync` nos testes de arquivo, sem mock de driver SQL). Cobre: geração de
id/nome/chave, unicidade sob `create()` concorrente, chave em texto puro nunca persistida,
prefix matching (`findByIdPrefix`, incluindo escaping de `%`/`_`/`\` do LIKE), pausa
reversível (`setActive`/`active`), `ON DELETE CASCADE` de reports ao revogar, round-trip
de snapshot `JSONB`, e a rota de push: `401` (sem/errada Authorization), `403
outpost_stopped` (key válida, Outpost pausado), `202` no caminho feliz com `lastSeenAt`
atualizado (fire-and-forget, checado com espera de 500ms — ver nota no próprio teste sobre
por que 100ms não bastava sob carga concorrente da suíte inteira). Requer
`docker compose up -d` deste pacote (ou o serviço `postgres:` do CI) antes de rodar.

### `@heraldserver/cli` — prioridade alta (implementado)

Comandos testados via chamada direta das funções exportadas de `index.ts`
(`runOutpostCreateCommand` etc.), sem subprocess — mais rápido, cobertura igual. Cada
comando de banco (`configure`, `outpost create/ls/inspect/stop/start/rm/prune`) testado contra
Postgres real via `createTestDatabase()` de `@heraldserver/server` (deep-import de
`@heraldserver/server/dist/test-db.js` — helper de teste, não parte da superfície pública do
pacote). Cobre: fallback de resolução de `--database-url` (flag > `DATABASE_URL` env >
config salva por `herald configure`, com isolamento de ambos numa mesma suíte —
`withoutDatabaseUrlEnv()` limpa temporariamente tanto a env var quanto um eventual
`~/.herald/config.json` real da máquina, sem apagar o que já existia lá), prompt
interativo do `configure` sem `--database-url` (mesmo padrão de `herald init`), prefix
matching de id (exato, único, ambíguo — lista os candidatos), `.env` gerado por
`outpost init`/`init` (docker-style, um comando só), o par `stop`/`start` (reversível,
diferente de `rm`), e `prune` (com/sem `<id>` pra escopar, cutoff exato de
`--older-than-days`, exigência de flag sem default). Requer o mesmo Postgres do
`@heraldserver/server` (é `file:../server`).

A validação de `--server-url` em `outpost init` (`assertSecureServerUrl`) não vive mais
duplicada dentro do CLI — importada direto de `@heraldserver/outpost` desde a extração
de 2026-08-08 (antes era uma cópia própria em `cli/src/security.ts`, sem teste nenhum até
uma auditoria em 2026-08-08 ter achado a lacuna e adicionado cobertura; essa cobertura
— incluindo os casos adversariais de parsing de URL, subdomínio `localhost.evil.com`,
HTTPS independente de loopback — migrou junto pro pacote `@heraldserver/outpost` na
extração, ver seção acima).

### `@heraldserver/prometheus` — prioridade média (implementado)

`PrometheusMetricsCollector` testado contra o próprio `Registry` do `prom-client` —
nenhuma infraestrutura externa (nem Postgres, nem rede), roda em milissegundos. Cobre:
contadores/histograma por `agent_type` pra cada método de `MetricsCollector`
(`incrementRequest`/`recordPolicyDecision`/`recordFormat`/`recordError`/`recordLatency`),
confirmação explícita de que `agentId` **nunca** aparece como label (regressão pro
anti-padrão de cardinalidade sem limite — ver ARCHITECTURE.md §4.4), `contentType` no
formato de texto Prometheus, e isolamento entre instâncias (`Registry` próprio por
`PrometheusMetricsCollector`, não o registry global do `prom-client` — duas instâncias no
mesmo processo não vazam contadores uma pra outra). Integração com `@heraldserver/gateway` (rota
`GET /metrics` reconhecendo `renderPrometheus()` via duck-typing) testada em
`gateway.test.ts`, não neste pacote — evita esse pacote depender de `express`.

### `@herald/poc` — coberto pelo script de demo (e2e), não por testes unitários

`poc/src/demo.ts` já cobre os 5 pontos do projeto mais verificação de assinatura e o fluxo
de monetização x402 (11 verificações no total, incluindo rate limiting — item 3b). Não faz
sentido duplicar como testes unitários — é deliberadamente um teste de sistema. Ganhou
`HERALD_METRICS=prometheus` opt-in (default continua `InMemoryMetricsCollector`/JSON) pra
exercitar `@heraldserver/prometheus` manualmente sem mudar o comportamento do script de demo.

## 3. Matriz de casos de teste — `@heraldserver/sdk`

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
- ~~**Fuzzing dos parsers**~~ — RESOLVIDO (2026-08-04, ICA-31): suíte determinística
  (mulberry32) em `sdk/src/fuzz.test.ts` cobre `identifyAgent`, `parseAcceptCapabilities`,
  `parsePaymentSignatureHeader`, `parseSignatureInputHeader` e `parseSignatureHeader` — ~3000
  entradas aleatórias (ASCII, controle, unicode, delimitadores da gramática) mais padrões
  adversariais explícitos (delimitador repetido, aspas/parênteses desbalanceados) por parser,
  com teto de 100ms/chamada como canário de backtracking patológico de regex. Resultado:
  nenhuma exceção não tratada, nenhuma chamada perto do teto (todas sub-milissegundo).
  `AGENT_ID_PATTERN` e `SIG_PARAMS_PATTERN` também testados manualmente com entradas de até
  400 KB sem sinal de ReDoS (crescimento linear, não exponencial). Tamanho de header em si já
  é limitado pelo servidor HTTP (`--max-http-header-size` do Node, default 16 KiB) antes de
  chegar nos parsers.
- ~~**Retenção de `outpost_reports`**~~ — RESOLVIDO (2026-08-08): tabela continua
  append-only por padrão (sem TTL automático, decisão consciente — ver ARCHITECTURE.md
  §5.3), mas `herald outpost prune [<id>] --older-than-days <n>` poda manualmente
  (`PgReportsStore.pruneOlderThan`, testado com/sem escopo de `id`, cutoff exato, 0
  resultado quando nada casa). Sem cron/job automático de propósito — mesma filosofia de
  "operador decide quando", tipo `docker system prune`. Validado manualmente que o
  caminho de push aguenta volume moderado (400 requisições concorrentes contra a PoC, mix
  humano/agente/rate-limitado, via `Gateway` real → `@heraldserver/server` → Postgres — sem
  erro, sem degradação de latência perceptível, contagens batendo exatamente no
  `herald outpost ls`/`inspect` depois), mas isso não é um teste de carga formal tipo
  `gateway/scripts/load-test.mjs` (não mede crescimento do banco ao longo do tempo/uso
  sustentado).

## 6. Checklist manual (Dashboard e exploratório)

- [ ] Dashboard mostra "Sem dados ainda" corretamente quando um Gateway está sem tráfego.
- [ ] Dashboard mostra cartão de erro quando um Gateway configurado está fora do ar,
      sem quebrar a renderização dos outros.
- [ ] Polling do Dashboard realmente atualiza a UI no intervalo configurado
      (`HERALD_POLL_INTERVAL_MS`).
- [ ] `/.well-known/herald` retorna `Content-Type: application/json` e valida contra
      `well-known-herald.schema.json` (conferir manualmente ou com um validador JSON Schema).

## 7. Como rodar

Localmente, pacote por pacote (ordem importa — cada pacote depende do `dist/` já
compilado do anterior via `file:../<pacote>`, não é workspace npm). `@heraldserver/server` e
`@heraldserver/cli` precisam de Postgres real (`docker compose up -d` dentro de `server/`):

```bash
cd server && docker compose up -d   # Postgres — necessário antes de server/ e cli/

cd sdk        && npm install && npm run build && npm test
cd ../outpost  && npm install && npm run build && npm test
cd ../gateway   && npm install && npm run build && npm test
cd ../dashboard  && npm install && npm run build && npm test
cd ../server      && npm install && npm run build \
                  && DATABASE_URL=postgres://herald:herald@localhost:5432/herald_server npm test
cd ../cli          && npm install && npm run build \
                  && DATABASE_URL=postgres://herald:herald@localhost:5432/herald_server npm test
cd ../prometheus    && npm install && npm run build && npm test
cd ../poc            && npm install && npm run build
# em um terminal: npm start   |   em outro: npm run demo
```

Em CI (`.github/workflows/ci.yml`), os 7 pacotes testáveis são buildados/testados nessa
mesma ordem a cada push/PR para `main` — `server`/`cli` contra um Postgres real via
`services:` nativo do GitHub Actions (mesmo `DATABASE_URL` acima) — incluindo o smoke e2e
da PoC (servidor sobe em background, `npm run demo` roda contra ele). A ordem não é
arbitrária: `gateway/` depende de `@heraldserver/sdk` E `@heraldserver/outpost`; `cli/`
depende de `@heraldserver/server` E `@heraldserver/outpost`; `poc/` depende de
`@heraldserver/prometheus` (`file:../prometheus`) — cada um precisa do `dist/` do outro já
buildado antes do próprio `npm install`.

## 8. Critério de "pronto"

Este plano considera a Fase de Testes minimamente cumprida quando:

1. Os testes unitários do `@heraldserver/sdk` e `@heraldserver/outpost` (§3) passam
   limpos (`npm test`).
2. Os testes de integração do `@heraldserver/gateway`, `@herald/dashboard`, `@heraldserver/server` e
   `@heraldserver/cli` passam limpos (`npm test`).
3. Os testes unitários do `@heraldserver/prometheus` passam limpos (`npm test`).
4. O script e2e da PoC (§4) passa 100% (`npm run demo` → N/N).
5. O workflow de CI passa verde a cada push.
6. As lacunas do §5 estão registradas (não escondidas) — este documento cumpre esse papel.

Cobertura de código (%) não é usada como critério aqui — os módulos testados são pequenos
e a cobertura por *caso de uso normativo do RFC* (tabelas acima) é mais informativa que uma
métrica de linhas cobertas.
