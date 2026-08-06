import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OutpostStore } from "./outposts.js";
import { MetricsHistoryStore } from "./history.js";
import { createOutpostRouter } from "./outpost-routes.js";

function buildApp() {
  const dir = mkdtempSync(join(tmpdir(), "herald-outpost-routes-test-"));
  const store = new OutpostStore(join(dir, "outposts.json"));
  const historyStore = new MetricsHistoryStore(60);
  const app = express();
  app.use(createOutpostRouter(store, historyStore));
  return { app, store, historyStore };
}

const snapshotOf = (agentId: string) => ({
  requestsByAgent: { [agentId]: 1 },
  decisionsByResult: { allow: 1 },
  formatsServed: { html: 1 },
  errorsByAgent: {},
  averageLatencyMs: 5,
  sampleCount: 1,
});

test("POST /api/outposts sem body cria com nome gerado", async () => {
  const { app } = buildApp();
  const res = await request(app).post("/api/outposts").send({});
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.name);
  assert.ok(res.body.key);

  const list = await request(app).get("/api/outposts");
  assert.equal(list.body.outposts.length, 1);
  assert.equal(list.body.outposts[0].key, undefined);
  assert.equal(list.body.outposts[0].keyHash, undefined);
});

test("POST /api/outposts com name usa o nome informado", async () => {
  const { app } = buildApp();
  const res = await request(app).post("/api/outposts").send({ name: "meu-app" });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, "meu-app");
});

test("POST /api/outposts/reports com chave correta grava no historyStore sob outpost:<id>", async () => {
  const { app, historyStore } = buildApp();
  const created = await request(app).post("/api/outposts").send({});
  const { id, key } = created.body;

  const res = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", `Bearer ${key}`)
    .send({ snapshot: snapshotOf("bot/1.0") });

  assert.equal(res.status, 202);
  const entries = historyStore.snapshot()[`outpost:${id}`];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].data?.requestsByAgent["bot/1.0"], 1);
});

test("POST /api/outposts/reports com chave errada retorna 401 e nao grava nada", async () => {
  const { app, historyStore } = buildApp();
  await request(app).post("/api/outposts").send({});

  const res = await request(app)
    .post("/api/outposts/reports")
    .set("Authorization", "Bearer hrld_op_chave-invalida")
    .send({ snapshot: snapshotOf("bot/1.0") });

  assert.equal(res.status, 401);
  assert.deepEqual(historyStore.snapshot(), {});
});

test("POST /api/outposts/reports sem Authorization retorna 401", async () => {
  const { app } = buildApp();
  const res = await request(app).post("/api/outposts/reports").send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(res.status, 401);
});

test("DELETE /api/outposts/:id revoga — GET nao lista mais, push com a chave antiga volta 401", async () => {
  const { app } = buildApp();
  const created = await request(app).post("/api/outposts").send({});
  const { id, key } = created.body;

  const del = await request(app).delete(`/api/outposts/${id}`);
  assert.equal(del.status, 204);

  const list = await request(app).get("/api/outposts");
  assert.equal(list.body.outposts.length, 0);

  const push = await request(app).post("/api/outposts/reports").set("Authorization", `Bearer ${key}`).send({ snapshot: snapshotOf("bot/1.0") });
  assert.equal(push.status, 401);
});

test("DELETE /api/outposts/:id de id desconhecido retorna 404", async () => {
  const { app } = buildApp();
  const res = await request(app).delete("/api/outposts/nao-existe");
  assert.equal(res.status, 404);
});
