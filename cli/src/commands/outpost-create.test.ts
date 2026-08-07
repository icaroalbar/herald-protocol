import { test, after } from "node:test";
import assert from "node:assert/strict";
// Helper de teste, deep-import de propósito (não faz parte da superfície pública de
// @herald/server — não deveria ir pro dist/lib.js).
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { createOutpost } from "./outpost-create.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("createOutpost cria direto no banco com o name, se informado", async () => {
  const result = await createOutpost({ databaseUrl, name: "meu-app" });
  assert.ok(result.id);
  assert.equal(result.name, "meu-app");
  assert.ok(result.key.startsWith("hrld_op_"));
});

test("createOutpost sem name gera um", async () => {
  const result = await createOutpost({ databaseUrl });
  assert.ok(result.name);
});
