import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@herald/server/dist/test-db.js";
import { PgOutpostStore } from "@herald/server";
import { resolveOutpost } from "./outpost-id.js";

const { pool, dropDatabase } = await createTestDatabase();
const outposts = new PgOutpostStore(pool);
after(() => dropDatabase());

test("resolveOutpost com id completo retorna o outpost (caminho exato, sem busca por prefixo)", async () => {
  const created = await outposts.create();
  const found = await resolveOutpost(outposts, created.id);
  assert.equal(found.id, created.id);
});

test("resolveOutpost com prefixo único (tipo docker) retorna o outpost", async () => {
  const created = await outposts.create();
  // 12 hex chars no id — prefixo de 6 já é suficientemente único na prática dos testes
  // (banco efêmero, poucos outposts), mas o teste não depende disso: cria só este um.
  const found = await resolveOutpost(outposts, created.id.slice(0, 6));
  assert.equal(found.id, created.id);
});

test("resolveOutpost com prefixo desconhecido lança 'não encontrado'", async () => {
  await assert.rejects(() => resolveOutpost(outposts, "zzzzzzzzzzzz"), /não encontrado/);
});

test("resolveOutpost com prefixo ambíguo lista os ids candidatos e lança", async () => {
  // Força uma colisão de prefixo criando ids conhecidos direto via query (create() gera
  // id aleatório, não dá pra garantir colisão de prefixo determinística sem isso).
  const dbName = "outpost-id-ambiguous";
  await pool.query(
    `INSERT INTO outposts (id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4)`,
    ["abc123000001", `${dbName}-a`, "hash-a", "hrld_op_aaaaaa"]
  );
  await pool.query(
    `INSERT INTO outposts (id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4)`,
    ["abc123000002", `${dbName}-b`, "hash-b", "hrld_op_bbbbbb"]
  );

  await assert.rejects(
    () => resolveOutpost(outposts, "abc123"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /ambíguo/);
      assert.match(err.message, /abc123000001/);
      assert.match(err.message, /abc123000002/);
      return true;
    }
  );
});
