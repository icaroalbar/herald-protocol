import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runCli,
  runOutpostCreateCommand,
  runOutpostInitCommand,
  runOutpostLsCommand,
  runOutpostRmCommand,
  runOutpostInspectCommand,
} from "./index.js";

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

test("outpost create sem --server-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostCreateCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost init sem --server-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostInitCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost init cria o outpost E grava .env de uma vez (docker-style, um comando so)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-outpost-init-test-"));
  const fetchImpl = fakeFetch({ id: "abc123", name: "teste", key: "hrld_op_x", createdAt: "2026-01-01T00:00:00.000Z" });

  await runOutpostInitCommand(["--server-url", "https://server.example.com", "--name", "teste"], { cwd, fetchImpl });

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /HERALD_SERVER_URL=https:\/\/server\.example\.com/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_x/);
});

test("outpost ls sem --server-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostLsCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost ls sem outposts imprime mensagem, sem exitCode", async () => {
  process.exitCode = undefined;
  const fetchImpl = fakeFetch({ outposts: [] });
  await runOutpostLsCommand(["--server-url", "https://x"], { fetchImpl });
  assert.equal(process.exitCode, undefined);
});

test("outpost rm sem id ou sem --server-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostRmCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;

  await assert.doesNotReject(() => runOutpostRmCommand(["abc123"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost rm com id + --server-url chama DELETE e nao seta exitCode em sucesso", async () => {
  process.exitCode = undefined;
  const fetchImpl = (async () => ({ ok: true, status: 204 }) as unknown as globalThis.Response) as unknown as typeof fetch;
  await runOutpostRmCommand(["abc123", "--server-url", "https://x"], { fetchImpl });
  assert.equal(process.exitCode, undefined);
});

test("outpost inspect sem id ou sem --server-url nao lanca, seta exitCode 1", async () => {
  process.exitCode = undefined;
  await assert.doesNotReject(() => runOutpostInspectCommand([]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;

  await assert.doesNotReject(() => runOutpostInspectCommand(["abc123"]));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
});

test("outpost inspect com id + --server-url imprime o detalhe, sem exitCode", async () => {
  process.exitCode = undefined;
  const fetchImpl = fakeFetch({
    id: "abc123",
    name: "teste",
    keyPrefix: "hrld_op_xy",
    createdAt: "now",
    lastSeenAt: null,
    latestReport: null,
  });
  await runOutpostInspectCommand(["abc123", "--server-url", "https://x"], { fetchImpl });
  assert.equal(process.exitCode, undefined);
});
