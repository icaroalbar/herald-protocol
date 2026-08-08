import * as crypto from "node:crypto";
import type pg from "pg";

/**
 * NOTE: geração de id/nome/chave (KEY_PREFIX, ADJECTIVES, NOUNS, generateOutpostId/Name/Key)
 * é duplicada verbatim de dashboard/src/outposts.ts — de propósito, não importada de lá.
 * dashboard/ está congelado (ICA-34/"deixar de lado a parte visual") e não deve virar
 * dependência de nenhum outro pacote; server/ é leaf igual cli/ nesse sentido. Se algum
 * detalhe de segurança da geração de chave mudar (prefixo, algoritmo de hash), precisa
 * mudar nos dois lugares à mão — não tem compilador/teste garantindo sincronia entre eles.
 */

const KEY_PREFIX = "hrld_op_";

const ADJECTIVES = [
  "brave", "calm", "eager", "fuzzy", "gentle", "happy", "jolly", "keen",
  "lively", "mighty", "noble", "plucky", "quiet", "rapid", "silent", "sturdy",
  "swift", "tidy", "vivid", "witty",
];
const NOUNS = [
  "falcon", "otter", "badger", "heron", "lynx", "raven", "sparrow", "wolf",
  "fox", "hawk", "ibis", "jaguar", "koala", "marten", "owl", "panther",
  "quail", "raccoon", "swan", "toucan",
];

function pick<T>(arr: T[]): T {
  return arr[crypto.randomInt(arr.length)];
}

export function generateOutpostId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function generateOutpostName(): string {
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${suffix}`;
}

export function generateOutpostKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.slice(0, KEY_PREFIX.length + 6);
  return { key, keyHash, keyPrefix };
}

export interface OutpostRecordPublic {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  /** false = "outpost stop" (docker-style pause) — push de métricas rejeitado (403) até
   * "outpost start". Diferente de remove(): stop é reversível, revoga nada. */
  active: boolean;
}

export interface CreateOutpostResult {
  id: string;
  name: string;
  /** Texto puro — retornado só nesta chamada, nunca mais recuperável. */
  key: string;
  createdAt: string;
}

interface OutpostRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: Date;
  last_seen_at: Date | null;
  active: boolean;
}

function toPublic(row: OutpostRow): OutpostRecordPublic {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    active: row.active,
  };
}

const MAX_ID_COLLISION_RETRIES = 5;

export class PgOutpostStore {
  constructor(private readonly pool: pg.Pool) {}

  async create(name?: string): Promise<CreateOutpostResult> {
    const { key, keyHash, keyPrefix } = generateOutpostKey();
    const resolvedName = name?.trim() || generateOutpostName();

    for (let attempt = 0; attempt < MAX_ID_COLLISION_RETRIES; attempt++) {
      const id = generateOutpostId();
      try {
        const { rows } = await this.pool.query<{ id: string; name: string; created_at: Date }>(
          `INSERT INTO outposts (id, name, key_hash, key_prefix)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, created_at`,
          [id, resolvedName, keyHash, keyPrefix]
        );
        return { id: rows[0].id, name: rows[0].name, key, createdAt: rows[0].created_at.toISOString() };
      } catch (err) {
        // 23505 = unique_violation. Colisão de id (12 hex chars) é vanishingly improvável,
        // mas trata igual ao Map-based OutpostStore original. Colisão de key_hash é
        // criptograficamente impossível — se acontecer, deixa propagar (é bug, não input hostil).
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505" && pgErr.constraint === "outposts_pkey") {
          continue;
        }
        throw err;
      }
    }
    throw new Error("Falha ao gerar id de Outpost único após várias tentativas");
  }

  async list(): Promise<OutpostRecordPublic[]> {
    const { rows } = await this.pool.query<OutpostRow>(
      `SELECT id, name, key_prefix, created_at, last_seen_at, active FROM outposts ORDER BY created_at ASC`
    );
    return rows.map(toPublic);
  }

  async get(id: string): Promise<OutpostRecordPublic | null> {
    const { rows } = await this.pool.query<OutpostRow>(
      `SELECT id, name, key_prefix, created_at, last_seen_at, active FROM outposts WHERE id = $1`,
      [id]
    );
    return rows.length ? toPublic(rows[0]) : null;
  }

  async findIdByKey(plaintextKey: string): Promise<string | null> {
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");
    const { rows } = await this.pool.query<{ id: string }>(`SELECT id FROM outposts WHERE key_hash = $1`, [
      keyHash,
    ]);
    return rows.length ? rows[0].id : null;
  }

  /** Fire-and-forget do ponto de vista do caller (rota não dá await) — mesmo espírito do
   * OutpostStore original: perder um lastSeenAt em falha é tolerável, não bloqueia o
   * caminho quente de push. */
  async touchLastSeen(id: string): Promise<void> {
    await this.pool.query(`UPDATE outposts SET last_seen_at = now() WHERE id = $1`, [id]);
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM outposts WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  /** true = "outpost start", false = "outpost stop" — pausa reversível, ao contrário de
   * remove() (revoga a key e cascateia os reports). Retorna false se o id não existe. */
  async setActive(id: string, active: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(`UPDATE outposts SET active = $2 WHERE id = $1`, [id, active]);
    return (rowCount ?? 0) > 0;
  }
}
