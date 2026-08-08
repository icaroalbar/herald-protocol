import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./test-db.js";
import { PgOutpostStore } from "./outposts.js";
import { PgReportsStore } from "./reports.js";

const { pool, dropDatabase } = await createTestDatabase();
const outpostStore = new PgOutpostStore(pool);
const reportsStore = new PgReportsStore(pool);
after(() => dropDatabase());

const snapshotOf = (agentId: string) => ({
  requestsByAgent: { [agentId]: 3 },
  decisionsByResult: { allow: 3 },
  formatsServed: { html: 3 },
  errorsByAgent: {},
  averageLatencyMs: 12,
  sampleCount: 3,
});

test("record() + latest() faz round-trip do snapshot (jsonb) corretamente", async () => {
  const outpost = await outpostStore.create();
  const reportedAt = "2026-01-01T00:00:00.000Z";
  await reportsStore.record(outpost.id, reportedAt, snapshotOf("bot/1.0"));

  const latest = await reportsStore.latest(outpost.id);
  assert.equal(latest?.reportedAt, reportedAt);
  assert.deepEqual(latest?.snapshot, snapshotOf("bot/1.0"));
});

test("latest() retorna null quando não há reports pro outpost", async () => {
  const outpost = await outpostStore.create();
  assert.equal(await reportsStore.latest(outpost.id), null);
});

test("latest() retorna o report mais recente, não o primeiro", async () => {
  const outpost = await outpostStore.create();
  await reportsStore.record(outpost.id, "2026-01-01T00:00:00.000Z", snapshotOf("bot-a/1.0"));
  await reportsStore.record(outpost.id, "2026-01-02T00:00:00.000Z", snapshotOf("bot-b/1.0"));

  const latest = await reportsStore.latest(outpost.id);
  assert.equal(latest?.reportedAt, "2026-01-02T00:00:00.000Z");
});

test("ON DELETE CASCADE: remover o outpost apaga os reports associados", async () => {
  const outpost = await outpostStore.create();
  await reportsStore.record(outpost.id, "2026-01-01T00:00:00.000Z", snapshotOf("bot/1.0"));

  await outpostStore.remove(outpost.id);

  const { rows } = await pool.query("SELECT * FROM outpost_reports WHERE outpost_id = $1", [outpost.id]);
  assert.equal(rows.length, 0);
});

test("pruneOlderThan apaga só reports anteriores ao cutoff, mantém os mais recentes", async () => {
  const outpost = await outpostStore.create();
  await reportsStore.record(outpost.id, "2020-01-01T00:00:00.000Z", snapshotOf("bot-velho/1.0"));
  await reportsStore.record(outpost.id, "2030-01-01T00:00:00.000Z", snapshotOf("bot-novo/1.0"));

  const deleted = await reportsStore.pruneOlderThan("2025-01-01T00:00:00.000Z");
  assert.equal(deleted, 1);

  const latest = await reportsStore.latest(outpost.id);
  assert.deepEqual(latest?.snapshot, snapshotOf("bot-novo/1.0"));
});

test("pruneOlderThan escopado a um outpostId não afeta outros Outposts", async () => {
  const outpostA = await outpostStore.create();
  const outpostB = await outpostStore.create();
  await reportsStore.record(outpostA.id, "2020-01-01T00:00:00.000Z", snapshotOf("a"));
  await reportsStore.record(outpostB.id, "2020-01-01T00:00:00.000Z", snapshotOf("b"));

  const deleted = await reportsStore.pruneOlderThan("2025-01-01T00:00:00.000Z", outpostA.id);
  assert.equal(deleted, 1);

  assert.equal(await reportsStore.latest(outpostA.id), null);
  assert.notEqual(await reportsStore.latest(outpostB.id), null);
});

test("pruneOlderThan retorna 0 quando nada casa o cutoff", async () => {
  const outpost = await outpostStore.create();
  await reportsStore.record(outpost.id, "2030-01-01T00:00:00.000Z", snapshotOf("bot/1.0"));

  assert.equal(await reportsStore.pruneOlderThan("2020-01-01T00:00:00.000Z"), 0);
});
