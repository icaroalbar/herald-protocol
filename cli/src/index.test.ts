import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli, runOutpostCreateCommand } from "./index.js";

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
