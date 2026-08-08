# @herald/server

Servidor de controle do Herald Protocol — gestão de Outposts e histórico de métricas,
backed by Postgres. **Sem UI** (ver [`@herald/dashboard`](../dashboard), congelado desde
a revisão que decidiu deixar a parte visual de lado por agora — continua existindo,
separado, pro caso de uso original de fazer poll de `/metrics` de Gateways individuais).

Duas formas de falar com este pacote, cada uma pra um consumidor diferente:

- **Biblioteca** (`@herald/server`, import direto) — `@herald/cli` usa isso pra
  criar/listar/revogar/inspecionar Outposts direto no Postgres, sem HTTP no meio.
  `PgOutpostStore`, `PgReportsStore`, `createPool`, `migrate`, `SCHEMA_SQL` (`src/lib.ts`).
- **HTTP** (processo `npm start`, `POST /api/outposts/reports`) — o Gateway/app monitorada
  usa isso pra empurrar métricas (`@herald/sdk`'s `createOutpostReporter`,
  `HERALD_SERVER_URL`). É a única rota HTTP que existe — a app monitorada nunca precisa
  (nem deve) ter credencial de Postgres, só a Outpost key.

## Por que Postgres, e por que isso agora exige Docker

Antes, tudo era self-host "zero infra": Outpost persistido em arquivo JSON, métricas em
memória. Isso resolvia identidade (sobrevive a restart) mas não histórico (métricas
zeravam a cada restart do Dashboard). Trocar pra Postgres resolve os dois de verdade —
o trade-off consciente é que agora rodar isso exige uma instância Postgres de verdade,
mais fácil via container.

## Instalação

```bash
npm install
npm run build
```

## Banco de dados

```bash
docker compose up -d          # sobe Postgres local (postgres:16-alpine)
```

`DATABASE_URL` esperado (já é o default do `docker-compose.yml` deste pacote):

```
postgres://herald:herald@localhost:5432/herald_server
```

Sem `DATABASE_URL`, o processo recusa subir (erro claro, sem fallback silencioso —
diferente do resto da config, que sempre teve default local).

Schema é aplicado automaticamente no startup (`CREATE TABLE/INDEX IF NOT EXISTS`,
idempotente — sem framework de migração, ver `src/schema.ts`).

## Rodando

```bash
DATABASE_URL=postgres://herald:herald@localhost:5432/herald_server npm start
# Herald Server rodando em http://localhost:4810
```

Porta default `4810` — faixa `48xx` reservada pros apps ativos do Herald (`server`=4810,
`poc`=4811), incomum o bastante pra não colidir com outra ferramenta rodando na mesma
máquina. `@herald/dashboard` (congelado) fica em `4000`, fora dessa faixa.

## Observabilidade (Prometheus)

```bash
docker compose up -d prometheus   # sobe junto com o Postgres, porta 9090
```

`prometheus.yml` já vem configurado pra fazer scrape de `http://host.docker.internal:4811/metrics`
(o `/metrics` de um app usando `@herald/gateway`, ex: `poc/`) — endereço portável,
funciona em Docker Desktop (Mac/Windows) e em Linux com dockerd nativo
(`extra_hosts: host.docker.internal:host-gateway` no `docker-compose.yml`).

**Status atual**: o container sobe e o alvo fica configurado, mas o scrape ainda falha —
`/metrics` hoje devolve JSON (`InMemoryMetricsCollector.snapshot()`), não o formato de
texto do Prometheus. Falta implementar um `MetricsCollector` baseado em `prom-client`
(interface já existe em `sdk/src/types.ts`, comentário em `sdk/src/metrics.ts` já aponta
essa extensão) — issue de acompanhamento pendente.

**Gotcha conhecido**: em WSL2 + Docker Desktop rodando o app monitorado *fora* de
container (fluxo de dev atual — `node dist/server.js` direto na distro), o container do
Prometheus não alcança `host.docker.internal` (resolve pro gateway da VM do Docker
Desktop, não pra rede da distro WSL2). Não é bug deste repo — é limitação dessa topologia
específica de máquina. Funciona normal em servidor Linux real ou Docker Desktop sem WSL2
no meio.

## Testes

Testes rodam contra Postgres **real** (não `pg-mem`/mock), cada arquivo de teste cria seu
próprio banco efêmero (`herald_test_<random>`) e derruba no final — precisa do
`docker compose up -d` deste pacote rodando antes:

```bash
docker compose up -d
DATABASE_URL=postgres://herald:herald@localhost:5432/herald_server npm run build && npm test
```

## Endpoints

| Rota | Descrição |
|---|---|
| `POST /api/outposts/reports` | Push de métricas, autenticado via `Authorization: Bearer <key>`. Retorna `401` (key errada/desconhecida) ou `403 {error: "outpost_stopped"}` (key válida, mas o Outpost foi pausado via `herald outpost stop`) |

Criar/listar/revogar/inspecionar/pausar/retomar Outpost não são mais rotas HTTP — são
chamadas via `@herald/cli` (`herald outpost create/ls/rm/inspect/stop/start
--database-url ...`), que importa este pacote como biblioteca e fala direto com Postgres.

## Biblioteca (`@herald/server`)

```ts
import { createPool, migrate, PgOutpostStore, PgReportsStore } from "@herald/server";

const pool = createPool(databaseUrl);
await migrate(pool); // idempotente, seguro de rodar toda vez
const outposts = new PgOutpostStore(pool);
const reports = new PgReportsStore(pool);
```

`src/index.ts` (o processo HTTP, `npm start`) não faz parte desse `main`/`types` — só é
invocado via `node dist/index.js`, tem efeito colateral (`app.listen`).

## Limitações conhecidas

- Sem política de retenção — `outpost_reports` é append-only, cresce sem limite. Decisão
  consciente (simplicidade primeiro); adicionar poda quando houver dado real de volume.
- Geração de id/nome/chave é duplicada verbatim de `dashboard/src/outposts.ts` (dashboard
  está congelado, não deve virar dependência de ninguém) — mudança de segurança nessa
  lógica precisa ser replicada nos dois lugares à mão.
