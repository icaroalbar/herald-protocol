import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@heraldserver/server/dist/test-db.js";
import { PgReportsStore } from "@heraldserver/server";
import { createOutpost } from "./outpost-create.js";
import { pruneReports } from "./outpost-prune.js";

const { pool, databaseUrl, dropDatabase } = await createTestDatabase();
const reports = new PgReportsStore(pool);
after(() => dropDatabase());

test("pruneReports sem id apaga reports antigos de todos os Outposts", async () => {
  const a = await createOutpost({ databaseUrl, name: "prune-a" });
  const b = await createOutpost({ databaseUrl, name: "prune-b" });
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  await reports.record(a.id, old, { x: 1 });
  await reports.record(b.id, old, { x: 1 });

  const result = await pruneReports(undefined, { databaseUrl, olderThanDays: 90 });
  assert.equal(result.deleted, 2);
});

test("pruneReports com id (prefixo) escopa a poda a um Outpost só", async () => {
  const a = await createOutpost({ databaseUrl, name: "prune-c" });
  const b = await createOutpost({ databaseUrl, name: "prune-d" });
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  await reports.record(a.id, old, { x: 1 });
  await reports.record(b.id, old, { x: 1 });

  const result = await pruneReports(a.id.slice(0, 6), { databaseUrl, olderThanDays: 90 });
  assert.equal(result.deleted, 1);

  assert.equal(await reports.latest(a.id), null);
  assert.notEqual(await reports.latest(b.id), null);
});

test("pruneReports com prefixo desconhecido lança 'não encontrado', não apaga nada", async () => {
  await assert.rejects(
    () => pruneReports("zzzzzzzzzzzz", { databaseUrl, olderThanDays: 90 }),
    /não encontrado/
  );
});
