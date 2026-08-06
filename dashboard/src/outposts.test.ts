import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OutpostStore } from "./outposts.js";

function tmpFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "herald-outposts-test-"));
  return join(dir, "outposts.json");
}

test("create() gera id de 12 hex chars e chave prefixada hrld_op_", async () => {
  const store = new OutpostStore(tmpFile());
  const result = await store.create();
  assert.match(result.id, /^[0-9a-f]{12}$/);
  assert.match(result.key, /^hrld_op_/);
});

test("a chave em texto puro nunca e persistida no arquivo em disco", async () => {
  const filePath = tmpFile();
  const store = new OutpostStore(filePath);
  const result = await store.create();

  const raw = readFileSync(filePath, "utf-8");
  assert.ok(!raw.includes(result.key), "arquivo em disco nao deveria conter a chave em texto puro");
});

test("uma segunda instancia no mesmo arquivo enxerga o que a primeira criou (sobrevive a restart)", async () => {
  const filePath = tmpFile();
  const store1 = new OutpostStore(filePath);
  const result = await store1.create("meu-app");

  const store2 = new OutpostStore(filePath);
  const found = store2.findByKey(result.key);
  assert.ok(found);
  assert.equal(found?.id, result.id);
  assert.equal(found?.name, "meu-app");
});

test("arquivo JSON corrompido nao derruba o processo, comeca vazio", () => {
  const dir = mkdtempSync(join(tmpdir(), "herald-outposts-test-"));
  const filePath = join(dir, "outposts.json");
  writeFileSync(filePath, "{ isso nao e json valido");

  const store = new OutpostStore(filePath);
  assert.deepEqual(store.list(), []);
});

test("arquivo/diretorio ausente comeca vazio, e create() cria o diretorio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "herald-outposts-test-"));
  const filePath = join(dir, "subpasta-nova", "outposts.json");
  const store = new OutpostStore(filePath);
  assert.deepEqual(store.list(), []);

  await store.create();
  const raw = readFileSync(filePath, "utf-8");
  assert.equal(JSON.parse(raw).length, 1);
});

test("findByKey com chave errada ou desconhecida retorna null", async () => {
  const store = new OutpostStore(tmpFile());
  await store.create();
  assert.equal(store.findByKey("hrld_op_chave-que-nao-existe"), null);
  assert.equal(store.findByKey("garbage"), null);
});

test("remove() apaga do id e do indice de chave — findByKey da chave antiga retorna null", async () => {
  const store = new OutpostStore(tmpFile());
  const result = await store.create();

  const removed = await store.remove(result.id);
  assert.equal(removed, true);
  assert.equal(store.list().length, 0);
  assert.equal(store.findByKey(result.key), null);
});

test("remove() de id desconhecido retorna false", async () => {
  const store = new OutpostStore(tmpFile());
  const removed = await store.remove("nao-existe");
  assert.equal(removed, false);
});

test("create() concorrente (Promise.all) nao perde nenhuma escrita (fila serializada)", async () => {
  const filePath = tmpFile();
  const store = new OutpostStore(filePath);

  await Promise.all([store.create("a"), store.create("b"), store.create("c")]);

  const raw = readFileSync(filePath, "utf-8");
  const records = JSON.parse(raw) as Array<{ name: string }>;
  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((r) => r.name).sort(),
    ["a", "b", "c"]
  );
});

test("list() nunca inclui keyHash", async () => {
  const store = new OutpostStore(tmpFile());
  await store.create();
  const [record] = store.list();
  assert.ok(!("keyHash" in record));
});
