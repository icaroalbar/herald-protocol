import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@heraldserver/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";
import { stopOutpost } from "./outpost-stop.js";
import { listOutposts } from "./outpost-list.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("stopOutpost marca active=false — reversível, diferente de remove", async () => {
  const created = await createOutpost({ databaseUrl });
  await stopOutpost(created.id, { databaseUrl });

  const list = await listOutposts({ databaseUrl });
  const found = list.find((o) => o.id === created.id);
  assert.ok(found, "outpost deve continuar existindo depois de stop");
  assert.equal(found?.active, false);
});

test("stopOutpost lanca Error especifico quando o id nao existe", async () => {
  await assert.rejects(() => stopOutpost("naoexiste1234", { databaseUrl }), /não encontrado/);
});
