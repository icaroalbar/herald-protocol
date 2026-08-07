import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnvVars } from "./env-file.js";

function tmpEnvPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "herald-cli-env-test-"));
  return join(dir, ".env");
}

test("cria o arquivo se nao existir", async () => {
  const filePath = tmpEnvPath();
  await upsertEnvVars(filePath, { FOO: "bar" });
  assert.equal(readFileSync(filePath, "utf-8"), "FOO=bar\n");
});

test("atualiza uma chave existente no lugar, sem tocar linhas nao relacionadas", async () => {
  const filePath = tmpEnvPath();
  writeFileSync(filePath, "# comentario\nOTHER=1\nFOO=old\n");
  await upsertEnvVars(filePath, { FOO: "new" });
  const content = readFileSync(filePath, "utf-8");
  assert.equal(content, "# comentario\nOTHER=1\nFOO=new\n");
});

test("acrescenta chave nova no final quando o arquivo existe mas nao tem essa chave", async () => {
  const filePath = tmpEnvPath();
  writeFileSync(filePath, "OTHER=1\n");
  await upsertEnvVars(filePath, { FOO: "bar" });
  const content = readFileSync(filePath, "utf-8");
  assert.equal(content, "OTHER=1\nFOO=bar\n");
});

test("rodar duas vezes com os mesmos valores e idempotente (saida identica)", async () => {
  const filePath = tmpEnvPath();
  await upsertEnvVars(filePath, { FOO: "bar", BAZ: "qux" });
  const first = readFileSync(filePath, "utf-8");
  await upsertEnvVars(filePath, { FOO: "bar", BAZ: "qux" });
  const second = readFileSync(filePath, "utf-8");
  assert.equal(first, second);
});

test("preserva linhas em branco e comentarios existentes", async () => {
  const filePath = tmpEnvPath();
  writeFileSync(filePath, "# topo\n\nFOO=1\n\n# fim\n");
  await upsertEnvVars(filePath, { FOO: "2" });
  const content = readFileSync(filePath, "utf-8");
  assert.equal(content, "# topo\n\nFOO=2\n\n# fim\n");
});

test("grava duas chaves novas de uma vez, ambas presentes", async () => {
  const filePath = tmpEnvPath();
  await upsertEnvVars(filePath, { HERALD_SERVER_URL: "http://localhost:4000", HERALD_OUTPOST_KEY: "hrld_op_abc" });
  const content = readFileSync(filePath, "utf-8");
  assert.match(content, /HERALD_SERVER_URL=http:\/\/localhost:4000/);
  assert.match(content, /HERALD_OUTPOST_KEY=hrld_op_abc/);
});
