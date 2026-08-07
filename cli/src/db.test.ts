import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDatabaseUrl } from "./db.js";
import { saveDatabaseUrl } from "./config.js";

function tmpConfigPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-db-test-"));
  return join(dir, "config.json");
}

test("resolveDatabaseUrl usa --database-url quando presente", async () => {
  const configPath = tmpConfigPath();
  const url = await resolveDatabaseUrl({ "database-url": "postgres://flag" }, configPath);
  assert.equal(url, "postgres://flag");
});

test("resolveDatabaseUrl cai pra config salva quando nao ha flag nem env", async () => {
  const configPath = tmpConfigPath();
  await saveDatabaseUrl("postgres://saved", configPath);

  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const url = await resolveDatabaseUrl({}, configPath);
    assert.equal(url, "postgres://saved");
  } finally {
    process.env.DATABASE_URL = saved;
  }
});

test("resolveDatabaseUrl lanca Error especifico quando nao ha flag, env nem config salva", async () => {
  const configPath = tmpConfigPath();

  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await assert.rejects(() => resolveDatabaseUrl({}, configPath), /herald configure/);
  } finally {
    process.env.DATABASE_URL = saved;
  }
});
