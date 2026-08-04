# Começando

Duas formas de adotar o Herald Protocol: usar `@herald/sdk` direto na sua aplicação, ou
instalar `@herald/gateway` como middleware Express (recomendado — cobre o pipeline
inteiro sem reescrever rotas).

## Via Gateway (recomendado)

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
