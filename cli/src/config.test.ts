import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSavedDatabaseUrl, saveDatabaseUrl } from "./config.js";

test("readSavedDatabaseUrl retorna undefined quando o arquivo nao existe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-config-test-"));
  const configPath = join(dir, "config.json");
  assert.equal(await readSavedDatabaseUrl(configPath), undefined);
});

test("saveDatabaseUrl grava, readSavedDatabaseUrl le de volta (cria diretorio se preciso)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-config-test-"));
  const configPath = join(dir, "nested", "config.json");

  await saveDatabaseUrl("postgres://user:pass@host:5432/db", configPath);
  const saved = await readSavedDatabaseUrl(configPath);

  assert.equal(saved, "postgres://user:pass@host:5432/db");
});

test("saveDatabaseUrl sobrescreve valor anterior", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-config-test-"));
  const configPath = join(dir, "config.json");

  await saveDatabaseUrl("postgres://a", configPath);
  await saveDatabaseUrl("postgres://b", configPath);

  assert.equal(await readSavedDatabaseUrl(configPath), "postgres://b");
});
