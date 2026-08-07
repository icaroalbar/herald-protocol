import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";
import { inspectOutpost } from "./outpost-inspect.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("inspectOutpost retorna o detalhe com latestReport null quando nunca reportou", async () => {
  const created = await createOutpost({ databaseUrl, name: "app-b" });
  const detail = await inspectOutpost(created.id, { databaseUrl });
  assert.equal(detail.id, created.id);
  assert.equal(detail.name, "app-b");
  assert.equal(detail.latestReport, null);
});

test("inspectOutpost lanca Error especifico quando o id nao existe", async () => {
  await assert.rejects(() => inspectOutpost("naoexiste1234", { databaseUrl }), /não encontrado/);
});
