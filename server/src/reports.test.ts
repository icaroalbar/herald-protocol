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
