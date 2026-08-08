import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { createOutpost } from "./commands/outpost-create.js";
import { defaultConfigPath, readSavedDatabaseUrl } from "./config.js";
import {
  runCli,
  runConfigureCommand,
  runOutpostCreateCommand,
  runOutpostInitCommand,
  runOutpostLsCommand,
  runOutpostStopCommand,
  runOutpostStartCommand,
  runOutpostRmCommand,
  runOutpostInspectCommand,
} from "./index.js";

const { databaseUrl, dropDatabase } = await createTestDatabase();
after(() => dropDatabase());

/** DATABASE_URL fica setado no processo de teste (createTestDatabase() precisa dele pra
 * conectar no Postgres administrativo), e a máquina que roda o teste pode ter um
 * ~/.herald/config.json real (de um `herald configure` de verdade) — testes que
 * verificam "sem --database-url" têm que isolar dos dois, senão o fallback de env var/
 * config salva (proposital, ver resolveDatabaseUrl) mascara o caso de erro. Restaura o
 * que já existia depois, nunca destrói config real do usuário. */
async function withoutDatabaseUrlEnv(fn: () => Promise<void>): Promise<void> {
  const savedEnv = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const configPath = defaultConfigPath();
  const savedConfig = await readFile(configPath, "utf-8").catch(() => undefined);
  if (savedConfig !== undefined) await rm(configPath);

  try {
    await fn();
  } finally {
    process.env.DATABASE_URL = savedEnv;
    if (savedConfig !== undefined) await writeFile(configPath, savedConfig, "utf-8");
  }
}

test("configure sem --database-url e resposta vazia no prompt nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runConfigureCommand([], { ask: async () => "" }));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("configure sem --database-url pergunta interativamente e usa a resposta", async () => {
  process.exitCode = undefined;
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-configure-prompt-test-"));
  const configPath = join(dir, "config.json");

  await runConfigureCommand([], { configPath, ask: async () => databaseUrl });
  assert.equal(process.exitCode, undefined);
  assert.equal(await readSavedDatabaseUrl(configPath), databaseUrl);
});

test("configure aplica schema e salva a URL — comando seguinte sem --database-url usa a config salva", async () => {
  process.exitCode = undefined;
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-configure-test-"));
  const configPath = join(dir, "config.json");

  await runConfigureCommand(["--database-url", databaseUrl], { configPath });
  assert.equal(process.exitCode, undefined);
  assert.equal(await readSavedDatabaseUrl(configPath), databaseUrl);
});

test("comando desconhecido nao lanca e seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runCli(["nao-existe"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("sem comando (help) nao lanca e nao seta exitCode", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runCli([]));
  assert.equal(process.exitCode, undefined);
});

test("outpost create sem --database-url nao lanca, seta exitCode 1", async () => {
  await withoutDatabaseUrlEnv(async () => {
    process.exitCode = undefined;
    await assert.doesNotReject(() => runOutpostCreateCommand([]));
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });
});

test("outpost init sem --database-url ou sem --server-url nao lanca, seta exitCode 1", async () => {
  await withoutDatabaseUrlEnv(async () => {
    process.exitCode = undefined;
    await assert.doesNotReject(() => runOutpostInitCommand([]));
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  await assert.doesNotReject(() => runOutpostInitCommand(["--database-url", databaseUrl]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost init cria o outpost no banco E grava .env de uma vez (docker-style, um comando so)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-outpost-init-test-"));

  await runOutpostInitCommand(
    ["--database-url", databaseUrl, "--server-url", "https://server.example.com", "--name", "teste"],
    { cwd }
  );

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /HERALD_SERVER_URL=https:\/\/server\.example\.com/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_/);
});

test("outpost ls sem --database-url nao lanca, seta exitCode 1", async () => {
  await withoutDatabaseUrlEnv(async () => {
    process.exitCode = undefined;
    await assert.doesNotReject(() => runOutpostLsCommand([]));
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });
});

test("outpost ls com --database-url nao seta exitCode", async () => {
  process.exitCode = undefined;
  await runOutpostLsCommand(["--database-url", databaseUrl]);
  assert.equal(process.exitCode, undefined);
});

test("outpost stop sem id ou sem --database-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostStopCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;

  await assert.doesNotReject(() => runOutpostStopCommand(["naoexiste1234"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost stop com id + --database-url para e nao seta exitCode em sucesso; outpost start retoma", async () => {
  process.exitCode = undefined;
  const created = await createOutpost({ databaseUrl, name: "stop-alvo" });

  await runOutpostStopCommand([created.id, "--database-url", databaseUrl]);
  assert.equal(process.exitCode, undefined);

  await runOutpostStartCommand([created.id, "--database-url", databaseUrl]);
  assert.equal(process.exitCode, undefined);
});

test("outpost rm sem id ou sem --database-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostRmCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;

  await assert.doesNotReject(() => runOutpostRmCommand(["naoexiste1234"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost rm com id + --database-url remove e nao seta exitCode em sucesso", async () => {
  process.exitCode = undefined;
  const created = await createOutpost({ databaseUrl, name: "rm-alvo" });
  await runOutpostRmCommand([created.id, "--database-url", databaseUrl]);
  assert.equal(process.exitCode, undefined);
});

test("outpost inspect sem id ou sem --database-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostInspectCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;

  await assert.doesNotReject(() => runOutpostInspectCommand(["naoexiste1234"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost inspect com id + --database-url imprime o detalhe, sem exitCode", async () => {
  process.exitCode = undefined;
  const created = await createOutpost({ databaseUrl, name: "inspect-alvo" });
  await runOutpostInspectCommand([created.id, "--database-url", databaseUrl]);
  assert.equal(process.exitCode, undefined);
});
