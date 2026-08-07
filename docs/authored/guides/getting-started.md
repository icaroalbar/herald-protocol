# Começando

Três formas de adotar o Herald Protocol, da mais rápida pra mais manual: CLI (`@herald/cli`,
cria uma identidade — "Outpost" — e configura o Gateway pra você), Gateway direto
(`@herald/gateway`, middleware Express, cobre o pipeline inteiro sem reescrever rotas), ou
SDK cru (`@herald/sdk`, só o que você precisar).

## Via CLI (mais rápido)

> **Ainda não publicado no npm** — pra ter o comando `herald` disponível globalmente
> hoje, use `npm link` (abaixo) em vez de `npm install -g @herald/cli`. Isso muda assim
> que o pacote for publicado — os comandos ficam idênticos.

> **Requer Docker** — o control plane (`@herald/server`) guarda Outposts e métricas em
> Postgres. Suba o banco antes de tudo, é o único pré-requisito de infra deste guia.

0. Suba o Postgres do control plane e o próprio `@herald/server` (terminal 1):

   ```bash
   cd server && docker compose up -d        # sobe Postgres, espera ficar saudável
   npm install && npm run build
   DATABASE_URL=postgres://herald:herald@localhost:5432/herald_server npm start
   # Herald Server rodando em http://localhost:4100
   ```

1. Instale o CLI globalmente (uma vez só, tipo `docker` sendo instalado na máquina):

   ```bash
   cd sdk && npm install && npm run build
   cd ../gateway && npm install && npm run build
   cd ../cli && npm install && npm run build && npm link
   ```

   A partir daqui, `herald` funciona de qualquer pasta do sistema — sem `node dist/bin.js`.

2. Crie um Outpost (a identidade da sua aplicação) e já configure o `.env` local num
   comando só — tipo `docker run`, cria e configura junto:

   ```bash
   herald outpost init --server-url http://localhost:4100 --name meu-app
   ```

   Isso cria o Outpost no Server **e** grava `HERALD_SERVER_URL`/
   `HERALD_OUTPOST_KEY` no `.env` do diretório atual — rode dentro da pasta da sua
   aplicação. Se preferir criar e configurar em máquinas/pastas diferentes (ex: copiar a
   key manualmente pra outro servidor), use os dois passos separados:

   ```bash
   herald outpost create --server-url http://localhost:4100 --name meu-app  # imprime a key
   herald init                                                              # pergunta URL + key, grava .env
   ```

3. Configure o Gateway para reportar métricas periodicamente (carregar o `.env` — via
   `node --env-file=.env` exige **Node ≥20.6**, acima do `engines: >=18` declarado nos
   pacotes; se estiver em Node 18/19, carregue as 2 variáveis manualmente):

   ```ts
   const gateway = createHeraldGateway({
     discovery: { /* ... */ },
     policy: { /* ... */ },
     reporting: {
       serverUrl: process.env.HERALD_SERVER_URL!,
       outpostKey: process.env.HERALD_OUTPOST_KEY!,
     },
   });
   gateway.startReporting();
   ```

   Push funciona através de firewalls corporativos outbound-only (ao contrário do modelo
   de polling do Dashboard, ver abaixo); self-hosting continua totalmente funcional sem
   nenhuma chamada a infraestrutura da Herald — o Server que gera e valida a Outpost key
   é o mesmo que você está rodando.

4. Acompanhe os Outposts pela linha de comando — sem tela, tudo via CLI:

   ```bash
   herald outpost ls                                    # lista todos, com last-seen
   herald outpost inspect <id> --server-url http://localhost:4100  # detalhe + último report
   herald outpost rm <id> --server-url http://localhost:4100       # revoga — reports em cascata, push com a key antiga passa a 401
   ```

> `@herald/dashboard` (UI web com gráficos) continua existindo, separado, pro caso de uso
> original de fazer *polling* das métricas de um Gateway individual em `/metrics` — ver
> seção "Via Gateway" abaixo. Ele não fala com o `@herald/server`; são dois control planes
> independentes, cada um pro seu fluxo (polling vs. push de Outpost).

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
