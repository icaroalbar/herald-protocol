import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";
import { removeOutpost } from "./outpost-remove.js";
import { listOutposts } from "./outpost-list.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("removeOutpost apaga o Outpost do banco", async () => {
  const created = await createOutpost({ databaseUrl });
  await removeOutpost(created.id, { databaseUrl });
  const remaining = await listOutposts({ databaseUrl });
  assert.ok(!remaining.some((o) => o.id === created.id));
});

test("removeOutpost lanca Error especifico quando o id nao existe", async () => {
  await assert.rejects(() => removeOutpost("naoexiste1234", { databaseUrl }), /não encontrado/);
});
