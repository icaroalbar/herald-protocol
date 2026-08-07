import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./test-db.js";
import { migrate } from "./db.js";

const { pool, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

test("migrate() é idempotente — rodar de novo não lança nem duplica tabelas", async () => {
  await assert.doesNotReject(() => migrate(pool));
  await assert.doesNotReject(() => migrate(pool));

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  assert.deepEqual(
    rows.map((r) => r.table_name),
    ["outpost_reports", "outposts"]
  );
});
