import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@heraldserver/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";
import { stopOutpost } from "./outpost-stop.js";
import { startOutpost } from "./outpost-start.js";
import { listOutposts } from "./outpost-list.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("startOutpost retoma um Outpost parado (active volta a true)", async () => {
  const created = await createOutpost({ databaseUrl });
  await stopOutpost(created.id, { databaseUrl });
  await startOutpost(created.id, { databaseUrl });

  const list = await listOutposts({ databaseUrl });
  const found = list.find((o) => o.id === created.id);
  assert.equal(found?.active, true);
});

test("startOutpost lanca Error especifico quando o id nao existe", async () => {
  await assert.rejects(() => startOutpost("naoexiste1234", { databaseUrl }), /não encontrado/);
});
