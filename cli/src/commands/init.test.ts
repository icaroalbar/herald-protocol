import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "./init.js";

function cannedAsk(answers: string[]): (question: string) => Promise<string> {
  let i = 0;
  return async () => answers[i++];
}

test("runInit grava HERALD_DASHBOARD_URL e HERALD_OUTPOST_KEY no .env do cwd informado", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-init-test-"));
  await runInit({ ask: cannedAsk(["http://localhost:4000", "hrld_op_abc123"]), cwd });

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /HERALD_DASHBOARD_URL=http:\/\/localhost:4000/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_abc123/);
});

test("runInit remove espacos em branco das respostas", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-init-test-"));
  await runInit({ ask: cannedAsk(["  http://localhost:4000  ", "  hrld_op_abc123  "]), cwd });

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /HERALD_DASHBOARD_URL=http:\/\/localhost:4000\n/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_abc123\n/);
});

test("runInit atualiza um .env ja existente sem apagar outras chaves", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "herald-cli-init-test-"));
  const fs = await import("node:fs/promises");
  await fs.writeFile(join(cwd, ".env"), "DATABASE_URL=postgres://x\n");

  await runInit({ ask: cannedAsk(["http://localhost:4000", "hrld_op_abc123"]), cwd });

  const content = readFileSync(join(cwd, ".env"), "utf-8");
  assert.match(content, /DATABASE_URL=postgres:\/\/x/);
  assert.match(content, /HERALD_DASHBOARD_URL=http:\/\/localhost:4000/);
});
