import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, runOutpostCreateCommand, runOutpostInitCommand } from "./index.js";

function fakeFetch(body: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as globalThis.Response) as unknown as typeof fetch;
}

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

test("outpost create sem --dashboard-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostCreateCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost init sem --dashboard-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostInitCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost init cria o outpost E grava .env de uma vez (docker-style, um comando so)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-outpost-init-test-"));
  const fetchImpl = fakeFetch({ id: "abc123", name: "teste", key: "hrld_op_x", createdAt: "2026-01-01T00:00:00.000Z" });

  await runOutpostInitCommand(["--dashboard-url", "https://dashboard.example.com", "--name", "teste"], { cwd, fetchImpl });

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /HERALD_DASHBOARD_URL=https:\/\/dashboard\.example\.com/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_x/);
});
