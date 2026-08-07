import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "./test-db.js";
import { PgOutpostStore } from "./outposts.js";
import { PgReportsStore } from "./reports.js";
import { createOutpostRouter } from "./outpost-routes.js";

const { pool, dropDatabase } = await createTestDatabase();
const store = new PgOutpostStore(pool);
const reportsStore = new PgReportsStore(pool);
const app = express();
app.use(createOutpostRouter(store, reportsStore));
after(() => dropDatabase());

const snapshotOf = (agentId: string) => ({
  requestsByAgent: { [agentId]: 1 },
  decisionsByResult: { allow: 1 },
  formatsServed: { html: 1 },
  errorsByAgent: {},
  averageLatencyMs: 5,
  sampleCount: 1,
});

test("POST /api/outposts sem body cria com nome gerado", async () => {
  const res = await request(app).post("/api/outposts").send({});
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.name);
  assert.ok(res.body.key);

  const list = await request(app).get("/api/outposts");
  assert.ok(list.body.outposts.some((o: { id: string }) => o.id === res.body.id));
  assert.equal(list.body.outposts.find((o: { id: string }) => o.id === res.body.id).key, undefined);
});

test("POST /api/outposts com name usa o nome informado", async () => {
  const res = await request(app).post("/api/outposts").send({ name: "roteador-app" });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, "roteador-app");
});

test("GET /api/outposts/:id retorna o outpost + latestReport null se nunca reportou", async () => {
  const created = await request(app).post("/api/outposts").send({});
  const res = await request(app).get(`/api/outposts/${created.body.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, created.body.id);
  assert.equal(res.body.latestReport, null);
});

test("GET /api/outposts/:id desconhecido retorna 404", async () => {
  const res = await request(app).get("/api/outposts/ffffffffffff");
  assert.equal(res.status, 404);
});

test("POST /api/outposts/reports com chave correta grava e aparece em GET /api/outposts/:id", async () => {
  const created = await request(app).post("/api/outposts").send({});
  const { id, key } = created.body;

  const push = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", `Bearer ${key}`)
    .send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(push.status, 202);

  const detail = await request(app).get(`/api/outposts/${id}`);
  assert.equal(detail.body.latestReport.snapshot.requestsByAgent["bot/1.0"], 1);

  // touchLastSeen é fire-and-forget de propósito (não bloqueia o caminho quente de
  // push, ver outpost-routes.ts) — checar lastSeenAt exige uma pequena espera, não é
  // garantido estar pronto no instante em que a resposta 202 volta.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const detailAfterWait = await request(app).get(`/api/outposts/${id}`);
  assert.ok(detailAfterWait.body.lastSeenAt);
});

test("POST /api/outposts/reports com chave errada retorna 401 e não grava nada", async () => {
  const created = await request(app).post("/api/outposts").send({});
  const res = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", "Bearer hrld_op_chave-invalida")
    .send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(res.status, 401);

  const detail = await request(app).get(`/api/outposts/${created.body.id}`);
  assert.equal(detail.body.latestReport, null);
});

test("POST /api/outposts/reports sem Authorization retorna 401", async () => {
  const res = await request(app).post("/api/outposts/reports").send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(res.status, 401);
});

test("DELETE /api/outposts/:id revoga — GET some, push com chave antiga volta 401, GET /api/outposts/:id vira 404", async () => {
  const created = await request(app).post("/api/outposts").send({});
  const { id, key } = created.body;

  const del = await request(app).delete(`/api/outposts/${id}`);
  assert.equal(del.status, 204);

  const detail = await request(app).get(`/api/outposts/${id}`);
  assert.equal(detail.status, 404);

  const push = await request(app).post("/api/outposts/reports").set("Authorization", `Bearer ${key}`).send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(push.status, 401);
});

test("DELETE /api/outposts/:id de id desconhecido retorna 404", async () => {
  const res = await request(app).delete("/api/outposts/ffffffffffff");
  assert.equal(res.status, 404);
});
