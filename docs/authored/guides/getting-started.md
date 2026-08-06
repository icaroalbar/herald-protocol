# Começando

Três formas de adotar o Herald Protocol, da mais rápida pra mais manual: CLI (`@herald/cli`,
cria uma identidade — "Outpost" — e configura o Gateway pra você), Gateway direto
(`@herald/gateway`, middleware Express, cobre o pipeline inteiro sem reescrever rotas), ou
SDK cru (`@herald/sdk`, só o que você precisar).

## Via CLI (mais rápido)

> **Ainda não publicado no npm** — os comandos abaixo usam `node dist/bin.js` do
> repositório clonado, não `npx @herald/cli`. Isso muda assim que o pacote for publicado.

1. Suba o Dashboard (self-hosted) e crie um Outpost — a identidade da sua aplicação:

   ```bash
   cd sdk && npm install && npm run build
   cd ../gateway && npm install && npm run build
   cd ../dashboard && npm install && npm run build && npm start   # terminal 1

   cd ../cli && npm install && npm run build
   node dist/bin.js outpost create --dashboard-url http://localhost:4000 --name meu-app
   ```

   Guarde a `key` retornada — não pode ser recuperada depois de fechar o terminal.

2. Na sua aplicação (já usando `@herald/sdk` + `@herald/gateway`), rode:

   ```bash
   node <caminho-do-repo>/cli/dist/bin.js init
   ```

   Informe a URL do Dashboard e a key. Isso grava (ou atualiza) `HERALD_DASHBOARD_URL` e
   `HERALD_OUTPOST_KEY` no `.env` do diretório atual.

3. Configure o Gateway para reportar métricas periodicamente (carregar o `.env` — via
   `node --env-file=.env` exige **Node ≥20.6**, acima do `engines: >=18` declarado nos
   pacotes; se estiver em Node 18/19, carregue as 2 variáveis manualmente):

   ```ts
   const gateway = createHeraldGateway({
     discovery: { /* ... */ },
     policy: { /* ... */ },
     reporting: {
       dashboardUrl: process.env.HERALD_DASHBOARD_URL!,
       outpostKey: process.env.HERALD_OUTPOST_KEY!,
     },
   });
   gateway.startReporting();
   ```

   As métricas aparecem em `GET /api/metrics/history` do Dashboard, sob a chave
   `outpost:<id>` — sem precisar configurar `HERALD_GATEWAYS` manualmente.

   Push funciona através de firewalls corporativos outbound-only (ao contrário do modelo
   de polling abaixo, que exige que o Dashboard alcance sua aplicação); self-hosting
   continua totalmente funcional sem nenhuma chamada a infraestrutura da Herald — o
   Dashboard que gera e valida a Outpost key é o mesmo que você está rodando.

## Via Gateway (configuração manual)

```bash
cd sdk && npm install && npm run build
cd ../gateway && npm install && npm run build
```

```ts
import express from "express";
import { createHeraldGateway } from "@herald/gateway";

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
  },
  policy: { defaultPolicy: { read: "allow" } },
});

app.use(gateway.router);
// ... suas rotas normais continuam funcionando
```

Pipeline completo, opções (`signatureVerification`, `monetization`) e todos os headers
envolvidos: ver [referência da API do Gateway](/reference/gateway-api) e o
[README do pacote](https://github.com/icaroalbar/herald-protocol/blob/main/gateway/README.md).

## Via SDK direto

Para quem não usa Express ou quer só um pedaço do protocolo (ex: só negociação de
formato, sem Policy Engine):

```ts
import { identifyAgent, parseAcceptCapabilities, negotiateFormat } from "@herald/sdk";

const agent = identifyAgent({ headers: req.headers });
const requested = parseAcceptCapabilities(req.headers["herald-accept-capabilities"]);
const { format, matched } = negotiateFormat(requested, ["structured-json", "html"]);
```

Toda a API: ver [referência do SDK](/reference/sdk/README) e o
[README do pacote](https://github.com/icaroalbar/herald-protocol/blob/main/sdk/README.md).

## Ver funcionando

O repositório inclui uma PoC completa (`poc/`) com servidor real + script de demo
validando os 11 cenários do protocolo ponta a ponta:

```bash
cd poc && npm install && npm run build
npm start           # terminal 1
npm run demo         # terminal 2 — 11/11 validações esperadas
```

Ver [README da PoC](https://github.com/icaroalbar/herald-protocol/blob/main/poc/README.md)
para o que cada verificação exercita.

## Próximos passos

- [RFC-0001](/spec/RFC-0001) — especificação normativa completa
- [SIGNATURES.md](/spec/SIGNATURES) — verificação criptográfica de identidade
- [MONETIZATION.md](/spec/MONETIZATION) — fluxo de pagamento x402 pro intent `ask`
- [CONTRIBUTING.md](/contributing/CONTRIBUTING) — como propor mudanças na spec ou no código
