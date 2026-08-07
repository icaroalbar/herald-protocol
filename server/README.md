# @herald/server

Servidor de controle do Herald Protocol — gestão de Outposts e histórico de métricas,
backed by Postgres. **Sem UI** (ver [`@herald/dashboard`](../dashboard), congelado desde
a revisão que decidiu deixar a parte visual de lado por agora — continua existindo,
separado, pro caso de uso original de fazer poll de `/metrics` de Gateways individuais).

Mesmo contrato HTTP que `@herald/dashboard` já tinha pra Outposts — `@herald/sdk`
(`createOutpostReporter`) e `@herald/cli` continuam funcionando sem mudança de código,
só apontando pra um servidor diferente.

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
# Herald Server rodando em http://localhost:4100
```

Porta default `4100` — deliberadamente diferente do `4000` do `@herald/dashboard`, pra
não colidir se alguém rodar os dois juntos durante a migração.

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
| `POST /api/outposts` | Cria um Outpost — `{name?}` → `{id, name, key, createdAt}` (key só aparece aqui, uma vez) |
| `GET /api/outposts` | Lista Outposts (sem chave/hash) |
| `GET /api/outposts/:id` | Detalhe de um Outpost + último report recebido |
| `DELETE /api/outposts/:id` | Revoga um Outpost (cascade: apaga o histórico de reports também) |
| `POST /api/outposts/reports` | Push de métricas, autenticado via `Authorization: Bearer <key>` |

## Limitações conhecidas

- Sem política de retenção — `outpost_reports` é append-only, cresce sem limite. Decisão
  consciente (simplicidade primeiro); adicionar poda quando houver dado real de volume.
- Geração de id/nome/chave é duplicada verbatim de `dashboard/src/outposts.ts` (dashboard
  está congelado, não deve virar dependência de ninguém) — mudança de segurança nessa
  lógica precisa ser replicada nos dois lugares à mão.
