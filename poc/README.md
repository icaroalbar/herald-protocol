# @herald/poc

Prova de conceito do **Herald Protocol** — uma app Express de exemplo (3 artigos) rodando
atrás do [`@herald/gateway`](../gateway), com um script que valida contra o servidor real os
5 pontos exigidos pelo projeto:

1. Identificação de agentes
2. Resposta diferenciada sem alterar o conteúdo
3. Políticas de acesso (incluindo rate limit)
4. Métricas
5. Extensibilidade e compatibilidade HTTP

...mais 2 checagens da verificação de identidade via assinatura (RFC 9421 / [SIGNATURES.md](../SIGNATURES.md)) e 3 checagens do fluxo de monetização (x402 / [MONETIZATION.md](../MONETIZATION.md)) — ambas decisões registradas em ICA-27.

## Instalação

Precisa do SDK e do Gateway já buildados (dependências `file:`):

```bash
cd sdk && npm install && npm run build
cd ../gateway && npm install && npm run build
cd ../poc && npm install && npm run build
```

## Rodando

Terminal 1 — sobe a aplicação de exemplo:

```bash
npm start
# Herald PoC rodando em http://localhost:3000
# Discovery: http://localhost:3000/.well-known/herald
# Métricas:  http://localhost:3000/metrics
```

Terminal 2 — roda a validação dos 5 pontos:

```bash
npm run demo
```

### Reportando pro Dashboard via Outpost (opcional)

Se `HERALD_DASHBOARD_URL` e `HERALD_OUTPOST_KEY` estiverem definidos, a PoC empurra
métricas periodicamente pro Dashboard (fluxo Outpost, ver [guia de instalação via
CLI](../docs/authored/guides/getting-started.md)). Sem essas duas variáveis, nada muda —
é aditivo.

```bash
cd ../cli && node dist/bin.js outpost create --dashboard-url http://localhost:4000 --name poc
# guarde a key retornada

HERALD_DASHBOARD_URL=http://localhost:4000 HERALD_OUTPOST_KEY=<key> npm start
```

Saída esperada (todas as linhas `OK`):

```
Validando PoC Herald em http://localhost:3000

OK   1. Identificacao de agentes — Herald-Policy-Decision presente: "intent=read; result=allow; rule=by_agent_type.assistant"
OK   2. Resposta diferenciada sem alterar conteudo — JSON estruturado (agente) contem o mesmo titulo/corpo do HTML servido ao humano
OK   3. Politicas de acesso (recurso com regra 'ask') — GET /artigos/relatorio-premium com agente -> HTTP 402 (esperado 402)
OK   3b. Rate limiting (crawler, limite de 5 req/min) — HTTP 429 recebido apos exceder o limite configurado
OK   4. Metricas — sampleCount=..., agentes rastreados=[...]
OK   5. Extensibilidade e compatibilidade HTTP — capability desconhecida + header Herald-Ext-* ignorados sem erro (HTTP 200); cliente humano sem headers Herald-* na resposta: true
OK   6. Verificacao de assinatura - assinatura valida aceita — requisicao assinada com a chave correta -> X-Herald-Debug-Agent-Verified=true
OK   7. Verificacao de assinatura - assinatura forjada rejeitada — requisicao com assinatura forjada (keyid real, chave errada) -> X-Herald-Debug-Agent-Verified=false (esperado false)
OK   8. Monetizacao (x402) - primeira tentativa retorna Payment-Required — Payment-Required decodificado: scheme=exact, network=base-sepolia, maxAmountRequired=1000
OK   9. Monetizacao (x402) - pagamento valido libera o recurso — GET /artigos/relatorio-premium com Payment-Signature valido -> HTTP 200, Payment-Response.success=true
OK   10. Monetizacao (x402) - pagamento insuficiente continua bloqueado — GET /artigos/relatorio-premium com Payment-Signature de valor insuficiente -> HTTP 402 (esperado 402)

10/10 validacoes passaram.
```

Terminal 3 (opcional) — sobe o Dashboard apontando pra este Gateway e vê as métricas
reais depois de rodar `npm run demo`:

```bash
cd ../dashboard
HERALD_GATEWAYS="poc=http://localhost:3000/metrics" npm start
# abra http://localhost:4000
```

## O que cada verificação exercita

- **1. Identificação**: requisição com `Herald-Agent-Id`/`Herald-Agent-Type` recebe de volta
  `Herald-Policy-Decision`, prova de que o Gateway identificou e processou o agente.
- **2. Resposta diferenciada**: o mesmo artigo é pedido como humano (HTML) e como agente
  (`structured-json` via formatter registrado) — o teste verifica que título e corpo são
  idênticos nas duas representações (RFC-0001 §7).
- **3. Políticas de acesso**: `/artigos/relatorio-premium` tem uma regra de recurso
  (`ask`) que qualquer agente recebe como `402`, independente do tipo. O rate limit do
  tipo `crawler` (5 req/min) é exercitado com 7 requisições seguidas, esperando `429` na
  6ª.
- **4. Métricas**: `/metrics` deve refletir as requisições feitas pelas checagens
  anteriores.
- **5. Extensibilidade**: um agente com `Herald-Ext-Custom-Field` (header não reconhecido) e
  uma capability inexistente em `Herald-Accept-Capabilities` não quebra a requisição — cai no
  fallback HTML (RFC-0001 §5.4.5, §10.3). Cliente humano segue sem qualquer header `Herald-*`
  na resposta (compatibilidade retroativa, RFC-0001 §3).
- **6-7. Verificação de assinatura**: o script busca a chave de demo em
  `GET /__poc/signing-key` (rota exclusiva da PoC — nunca faça isso em produção), assina
  uma requisição de verdade com `signRequest` (RFC 9421, ver [SIGNATURES.md](../SIGNATURES.md))
  e confirma que o Gateway marca `X-Herald-Debug-Agent-Verified: true`. Em seguida, assina
  outra requisição reivindicando o mesmo `keyid` mas com uma chave privada diferente
  (impostor) e confirma que o Gateway rejeita (`verified: false`) — prova que a
  verificação criptográfica de fato distingue identidade real de identidade forjada, não
  só identidade ausente.

## Estrutura

```
poc/
├── src/
│   ├── data.ts     # 3 artigos de exemplo (fonte única de verdade do conteúdo)
│   ├── app.ts        # Gateway configurado + rotas Express
│   ├── server.ts       # inicia o servidor HTTP
│   └── demo.ts           # script de validação dos 5 pontos
├── package.json
├── tsconfig.json
└── README.md
```

## Status

Implementação de referência da PoC (ICA-22/ICA-23 no roadmap do Herald Protocol). `npm run demo`
cobre manualmente o que seria o "teste com bots e navegadores automatizados" citado no
roadmap — simula os headers que um bot real enviaria. Testes automatizados formais (CI,
cobertura) ficam para o Plano de Testes (ICA-11).
