# Herald Protocol — Referência de Headers, Endpoint de Descoberta e Negociação

> Detalha normativamente o que o [RFC-0001](./RFC-0001.md) define em §4, §5, §6 e §8.4.
> Schema JSON completo do documento de descoberta: [`well-known-herald.schema.json`](./well-known-herald.schema.json).

## 1. Tabela de Headers

| Header | Direção | Obrigatoriedade | Definido em |
|---|---|---|---|
| `Herald-Agent-Id` | Requisição | MUST (para se identificar como agente Herald) | RFC-0001 §4.1 |
| `Herald-Agent-Type` | Requisição | MUST (junto com `Herald-Agent-Id`) | RFC-0001 §4.2 |
| `Herald-Accept-Capabilities` | Requisição | SHOULD | RFC-0001 §5.1 |
| `Herald-Resource-Policy` | Requisição/Config de origem | MAY | RFC-0001 §8.3 |
| `Herald-Content-Format` | Resposta | MUST quando há negociação | RFC-0001 §5.2 |
| `Herald-Policy-Decision` | Resposta | MUST quando Policy Engine é consultado | RFC-0001 §8.4 |
| `Vary` | Resposta | MUST incluir `Herald-Agent-Id, Herald-Accept-Capabilities` quando corpo varia | RFC-0001 §5.3 |
| `Retry-After` | Resposta (em 429) | MUST | RFC-0001 §8.5 |

## 2. Gramática (ABNF simplificado)

```abnf
Herald-Agent-Id        = vendor "-" product "/" version
vendor                  = 1*(ALPHA / DIGIT / "_")
product                 = 1*(ALPHA / DIGIT / "_" / "-")
version                 = 1*(DIGIT / ".")

Herald-Agent-Type       = "assistant" / "crawler" / "autonomous" / "search-index"

Herald-Accept-Capabilities = capability-pref *("," OWS capability-pref)
capability-pref         = capability [";" "q=" qvalue]
capability              = 1*(ALPHA / DIGIT / "-")
qvalue                  = ("0" ["." 0*3DIGIT]) / ("1" ["." 0*3("0")])

Herald-Content-Format   = capability

Herald-Policy-Decision  = "intent=" intent "; result=" result "; rule=" rule-path
intent                  = "read" / "train" / "redistribute" / "monetize"
result                  = "allow" / "deny" / "ask" / "not-applicable"
rule-path               = 1*(ALPHA / DIGIT / "." / "_" / "-")
```

## 3. Exemplos por Header

### `Herald-Agent-Id`
```
Herald-Agent-Id: anthropic-claude/1.0
Herald-Agent-Id: openai-gptbot/2.1
Herald-Agent-Id: acme-researchcrawler/0.3
```

### `Herald-Agent-Type`
```
Herald-Agent-Type: assistant
```

### `Herald-Accept-Capabilities`
```
Herald-Accept-Capabilities: structured-json;q=1.0, markdown;q=0.8, html;q=0.3
```
Regra de resolução: a origem escolhe, entre suas `capabilities` declaradas no discovery
document, aquela de maior `q` presente também na lista do agente. Empate é resolvido pela
ordem de preferência da origem (array `capabilities`).

### `Herald-Content-Format` (resposta)
```
Herald-Content-Format: structured-json
```

### `Herald-Policy-Decision` (resposta)
```
Herald-Policy-Decision: intent=read; result=allow; rule=by_agent_type.assistant
Herald-Policy-Decision: intent=train; result=deny; rule=by_agent_type.crawler
```

### `Herald-Resource-Policy` (declarado pela origem, não pelo agente)
Usado internamente pela aplicação/Gateway para anotar uma rota com política específica
(via configuração, não como header HTTP real de requisição de terceiros):
```
Herald-Resource-Policy: /artigos/premium/* -> { "read": "ask" }
```

## 4. Endpoint de Descoberta — `GET /.well-known/herald`

- **Método**: `GET` apenas.
- **Autenticação**: nenhuma — o documento é público por definição.
- **Content-Type de resposta**: `application/json`.
- **Cache**: `Cache-Control: max-age=3600` ou superior (RFC-0001 §6.2).
- **Status codes**:
  - `200 OK` — documento retornado normalmente.
  - `404 Not Found` — origem não implementa o Herald Protocol (comportamento padrão, não é
    erro).
- Segue a convenção RFC 8615 (Well-Known URIs): path fixo, sem versionamento na URL —
  versionamento vive no campo `herald_version` do corpo.

Schema completo: [`well-known-herald.schema.json`](./well-known-herald.schema.json) (JSON
Schema Draft 2020-12). Resumo dos campos:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `herald_version` | string | sim | Versão do protocolo, `MAJOR.MINOR` |
| `origin` | string (uri) | sim | URL base da origem |
| `capabilities` | array de string | sim | Formatos suportados, em ordem de preferência |
| `endpoints` | object | não | Endpoints alternativos por capacidade |
| `policies.default` | object | sim | Política padrão para todos os intents |
| `policies.by_agent_type` | object | não | Override por `Herald-Agent-Type` |
| `policies.by_agent_id` | object | não | Override por `Herald-Agent-Id` específico |
| `analytics` | object | não | Metadados sobre como métricas são tratadas |
| `extensions` | object | não | Campos não normativos (RFC-0001 §10.3) |

## 5. Algoritmo de Negociação (pseudocódigo de referência)

```ts
function negotiate(request, discoveryDoc, policyEngine) {
  const agent = identifyAgent(request.headers); // §4

  const decision = policyEngine.evaluate({
    agentId: agent.agentId,
    agentType: agent.agentType,
    resource: request.path,
    intent: "read", // outras intents avaliadas conforme uso declarado, fora do hot path de leitura
  });

  if (decision.result === "deny") {
    return respond(403, { "Herald-Policy-Decision": formatDecision(decision) });
  }
  if (decision.result === "ask") {
    return respond(402, { "Herald-Policy-Decision": formatDecision(decision), "Link": approvalLink });
  }

  const requested = parseAcceptCapabilities(request.headers["Herald-Accept-Capabilities"]);
  const supported = discoveryDoc.capabilities;
  const format = pickHighestCommon(requested, supported) ?? "html"; // fallback obrigatório, §5.4.5

  const body = renderContent(request.path, format);

  return respond(200, {
    "Herald-Content-Format": format,
    "Herald-Policy-Decision": formatDecision(decision),
    "Vary": "Herald-Agent-Id, Herald-Accept-Capabilities",
  }, body);
}
```

## 6. Casos de Borda Normativos

- Requisição sem `Herald-Agent-Id` nem `User-Agent` reconhecido → tratada como humano;
  nenhum header `Herald-*` é adicionado à resposta.
- `Herald-Accept-Capabilities` presente mas sem interseção com `capabilities` da origem →
  origem MUST responder com a representação padrão (`html`), nunca `406 Not Acceptable`.
- `Herald-Agent-Id` presente mas mal formado (não casa com a gramática §2) → Gateway MUST
  tratar como não identificado (fallback para `User-Agent`), não MUST rejeitar a
  requisição.
- Múltiplos valores de `Herald-Policy-Decision` nunca ocorrem — apenas a decisão final
  (após toda a árvore de precedência, RFC-0001 §8.3) é exposta.
