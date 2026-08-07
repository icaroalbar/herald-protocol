import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "./test-db.js";
import { PgOutpostStore } from "./outposts.js";
import { PgReportsStore } from "./reports.js";
import { createPushRouter } from "./push-routes.js";

const { pool, dropDatabase } = await createTestDatabase();
const store = new PgOutpostStore(pool);
const reportsStore = new PgReportsStore(pool);
const app = express();
app.use(createPushRouter(store, reportsStore));
after(() => dropDatabase());

const snapshotOf = (agentId: string) => ({
  requestsByAgent: { [agentId]: 1 },
  decisionsByResult: { allow: 1 },
  formatsServed: { html: 1 },
  errorsByAgent: {},
  averageLatencyMs: 5,
  sampleCount: 1,
});

test("POST /api/outposts/reports com chave correta grava o report e atualiza lastSeenAt", async () => {
  const { id, key } = await store.create();

  const push = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", `Bearer ${key}`)
    .send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(push.status, 202);

  const latest = await reportsStore.latest(id);
  assert.equal((latest?.snapshot as { requestsByAgent: Record<string, number> }).requestsByAgent["bot/1.0"], 1);

  // touchLastSeen é fire-and-forget de propósito (não bloqueia o caminho quente de
  // push, ver push-routes.ts) — checar lastSeenAt exige uma pequena espera.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const outpost = await store.get(id);
  assert.ok(outpost?.lastSeenAt);
});

test("POST /api/outposts/reports com chave errada retorna 401 e não grava nada", async () => {
  const { id } = await store.create();
  const res = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", "Bearer hrld_op_chave-invalida")
    .send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(res.status, 401);
  assert.equal(await reportsStore.latest(id), null);
});

test("POST /api/outposts/reports sem Authorization retorna 401", async () => {
  const res = await request(app).post("/api/outposts/reports").send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(res.status, 401);
});
