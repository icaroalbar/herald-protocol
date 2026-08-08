# @heraldserver/outpost

Cliente de push de métricas do Herald Protocol — reporta periodicamente pro control
plane ([`@heraldserver/server`](../server)), fluxo Outpost.

Pacote separado, zero dependência de runtime — não é parte do `@heraldserver/sdk`
(identificação/negociação/Policy Engine/assinatura são outra preocupação). Quem só quer
que sua aplicação reporte métricas pro control plane não precisa puxar o resto do
protocolo junto — mesmo espírito de `@heraldserver/prometheus` ser pacote à parte.

## Uso

```ts
import { createOutpostReporter } from "@heraldserver/outpost";

const reporter = createOutpostReporter(() => metricsCollector.snapshot(), {
  serverUrl: process.env.HERALD_SERVER_URL!,
  outpostKey: process.env.HERALD_OUTPOST_KEY!,
});

reporter.start(); // push periódico em background (default: a cada 60s)
```

`@heraldserver/gateway` já usa isso internamente via `config.reporting` — a maioria dos
usuários nunca importa este pacote diretamente, só configura o Gateway. Uso direto faz
sentido pra quem não usa o Gateway (SDK cru, ou nenhum framework Herald) mas ainda quer
reportar métricas pro control plane.

## Segurança

`serverUrl` precisa ser `https://` ou loopback (`localhost`/`127.0.0.1`/`::1`) — a
Outpost key viaja em `Authorization: Bearer` a cada push, texto puro por HTTP não é
seguro fora de rede local. `allowInsecureHttp: true` só se a conexão já está protegida
por outra camada (VPN/rede privada) — nunca na internet pública.

## Testes

```bash
npm install && npm run build && npm test
```

Sem dependência externa — testes usam `fetchImpl` injetável, nenhuma rede real.
