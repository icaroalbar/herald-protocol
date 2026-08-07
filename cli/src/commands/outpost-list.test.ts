import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";
import { listOutposts } from "./outpost-list.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("listOutposts sem nenhum Outpost retorna lista vazia", async () => {
  const result = await listOutposts({ databaseUrl });
  assert.deepEqual(result, []);
});

test("listOutposts retorna os Outposts criados, sem key/keyHash", async () => {
  const created = await createOutpost({ databaseUrl, name: "app-a" });
  const result = await listOutposts({ databaseUrl });
  const found = result.find((o) => o.id === created.id);
  assert.ok(found);
  assert.equal(found?.name, "app-a");
  assert.equal((found as unknown as { key?: string }).key, undefined);
});
