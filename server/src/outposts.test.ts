import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./test-db.js";
import { PgOutpostStore } from "./outposts.js";

const { pool, dropDatabase } = await createTestDatabase();
const store = new PgOutpostStore(pool);
after(() => dropDatabase());

test("create() gera id de 12 hex chars e chave prefixada hrld_op_", async () => {
  const result = await store.create();
  assert.match(result.id, /^[0-9a-f]{12}$/);
  assert.match(result.key, /^hrld_op_/);
});

test("create() com name usa o nome informado; sem name gera um", async () => {
  const named = await store.create("meu-app");
  assert.equal(named.name, "meu-app");

  const unnamed = await store.create();
  assert.match(unnamed.name, /^[a-z]+-[a-z]+-[0-9a-f]{4}$/);
});

test("a chave em texto puro nunca fica no banco — só key_hash/key_prefix", async () => {
  const result = await store.create();
  const { rows } = await pool.query("SELECT key_hash, key_prefix FROM outposts WHERE id = $1", [result.id]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].key_hash, result.key);
  assert.ok(!rows[0].key_hash.includes(result.key));
});

test("list() retorna sem keyPrefix leak de outros campos sensíveis (só id/name/keyPrefix/createdAt/lastSeenAt/active)", async () => {
  await store.create("teste-list");
  const list = await store.list();
  const found = list.find((o) => o.name === "teste-list");
  assert.ok(found);
  assert.deepEqual(Object.keys(found).sort(), ["active", "createdAt", "id", "keyPrefix", "lastSeenAt", "name"]);
});

test("get() retorna o outpost por id; null se não existe", async () => {
  const created = await store.create("teste-get");
  const found = await store.get(created.id);
  assert.equal(found?.name, "teste-get");
  assert.equal(await store.get("000000000000"), null);
});

test("create() nasce active por padrão", async () => {
  const created = await store.create();
  const found = await store.get(created.id);
  assert.equal(found?.active, true);
});

test("setActive(id, false) para; setActive(id, true) retoma", async () => {
  const created = await store.create();

  assert.equal(await store.setActive(created.id, false), true);
  assert.equal((await store.get(created.id))?.active, false);

  assert.equal(await store.setActive(created.id, true), true);
  assert.equal((await store.get(created.id))?.active, true);
});

test("setActive() de id desconhecido retorna false", async () => {
  assert.equal(await store.setActive("ffffffffffff", false), false);
});

test("findIdByKey com chave correta retorna o id; errada ou desconhecida retorna null", async () => {
  const created = await store.create();
  assert.equal(await store.findIdByKey(created.key), created.id);
  assert.equal(await store.findIdByKey("hrld_op_chave-errada"), null);
  assert.equal(await store.findIdByKey("garbage"), null);
});

test("touchLastSeen atualiza last_seen_at", async () => {
  const created = await store.create();
  const before = await store.get(created.id);
  assert.equal(before?.lastSeenAt, null);

  await store.touchLastSeen(created.id);
  const after1 = await store.get(created.id);
  assert.notEqual(after1?.lastSeenAt, null);
});

test("remove() apaga o outpost — get() e findIdByKey() passam a retornar null/not-found", async () => {
  const created = await store.create();
  const removed = await store.remove(created.id);
  assert.equal(removed, true);
  assert.equal(await store.get(created.id), null);
  assert.equal(await store.findIdByKey(created.key), null);
});

test("remove() de id desconhecido retorna false", async () => {
  assert.equal(await store.remove("ffffffffffff"), false);
});

test("create() concorrente (Promise.all) não perde nenhuma escrita", async () => {
  const results = await Promise.all([store.create("conc-a"), store.create("conc-b"), store.create("conc-c")]);
  const ids = results.map((r) => r.id);
  assert.equal(new Set(ids).size, 3);

  const list = await store.list();
  for (const id of ids) {
    assert.ok(list.some((o) => o.id === id));
  }
});
