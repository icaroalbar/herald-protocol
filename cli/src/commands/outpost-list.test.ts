import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@heraldserver/server/dist/test-db.js";
import { PgReportsStore } from "@heraldserver/server";
import { createOutpost } from "./outpost-create.js";
import { listOutposts } from "./outpost-list.js";

const { pool, databaseUrl, dropDatabase } = await createTestDatabase();
const reports = new PgReportsStore(pool);
after(() => dropDatabase());

test("listOutposts sem nenhum Outpost retorna lista vazia", async () => {
  const result = await listOutposts({ databaseUrl });
  assert.deepEqual(result, []);
});

test("listOutposts retorna os Outposts criados, sem key/keyHash, sem report humano/agente zerado", async () => {
  const created = await createOutpost({ databaseUrl, name: "app-a" });
  const result = await listOutposts({ databaseUrl });
  const found = result.find((o) => o.id === created.id);
  assert.ok(found);
  assert.equal(found?.name, "app-a");
  assert.equal((found as unknown as { key?: string }).key, undefined);
  assert.equal(found?.humanRequests, 0);
  assert.equal(found?.agentRequests, 0);
});

test("listOutposts separa humano (unknown:unknown) de agente (qualquer outro bucket) no ultimo report", async () => {
  const created = await createOutpost({ databaseUrl, name: "app-b" });
  await reports.record(created.id, new Date().toISOString(), {
    requestsByAgent: { "unknown:unknown": 3, "openai-gptbot/unknown": 5, "acme-bot/1.0": 2 },
  });

  const result = await listOutposts({ databaseUrl });
  const found = result.find((o) => o.id === created.id);
  assert.equal(found?.humanRequests, 3);
  assert.equal(found?.agentRequests, 7);
});
