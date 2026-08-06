import * as crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Registro persistido de Outposts (identidades de aplicações monitoradas — ver ICA-34).
 * Primeira persistência em arquivo do repositório: diferente de InMemoryMetricsCollector/
 * MetricsHistoryStore (observações, ok perder no restart), a chave de um Outpost é
 * credencial — perdê-la no restart do Dashboard revogaria silenciosamente todo mundo já
 * conectado. Ainda assim não é um banco de dados: é um arquivo JSON com escrita atômica.
 */

export interface OutpostRecord {
  id: string;
  name: string;
  /** sha256 da chave — a chave em texto puro nunca é persistida. */
  keyHash: string;
  /** Primeiros caracteres da chave, seguro pra exibir em listagens futuras. */
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface CreateOutpostResult {
  id: string;
  name: string;
  /** Texto puro — retornado só nesta chamada, nunca mais recuperável. */
  key: string;
  createdAt: string;
}

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

export class OutpostStore {
  private byId = new Map<string, OutpostRecord>();
  private byKeyHash = new Map<string, string>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    this.loadSync();
  }

  private loadSync(): void {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf-8");
    } catch {
      return; // arquivo ausente (primeira vez) -> começa vazio, sem erro
    }
    try {
      const records = JSON.parse(raw) as OutpostRecord[];
      for (const record of records) {
        this.byId.set(record.id, record);
        this.byKeyHash.set(record.keyHash, record.id);
      }
    } catch {
      // JSON corrompido: loga e começa vazio, nunca derruba o processo por causa disso.
      console.warn(`[herald-dashboard] ${this.filePath} corrompido, ignorando e começando vazio.`);
    }
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.writeFileAtomic());
    return this.writeQueue;
  }

  private async writeFileAtomic(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const records = [...this.byId.values()];
    await writeFile(tmpPath, JSON.stringify(records, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  async create(name?: string): Promise<CreateOutpostResult> {
    let id = generateOutpostId();
    while (this.byId.has(id)) id = generateOutpostId(); // colisão vanishingly improvável, mas trata

    const { key, keyHash, keyPrefix } = generateOutpostKey();
    const record: OutpostRecord = {
      id,
      name: name?.trim() || generateOutpostName(),
      keyHash,
      keyPrefix,
      createdAt: new Date().toISOString(),
      lastSeenAt: null,
    };

    this.byId.set(id, record);
    this.byKeyHash.set(keyHash, id);
    await this.persist();

    return { id, name: record.name, key, createdAt: record.createdAt };
  }

  list(): Omit<OutpostRecord, "keyHash">[] {
    return [...this.byId.values()].map(({ keyHash: _keyHash, ...rest }) => rest);
  }

  findByKey(plaintextKey: string): OutpostRecord | null {
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");
    const id = this.byKeyHash.get(keyHash);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  touchLastSeen(id: string): void {
    const record = this.byId.get(id);
    if (!record) return;
    record.lastSeenAt = new Date().toISOString();
    // Fire-and-forget: perder um lastSeenAt em crash é tolerável, diferente de perder
    // uma credencial recém-criada — não bloqueia o caminho quente de push.
    void this.persist();
  }

  async remove(id: string): Promise<boolean> {
    const record = this.byId.get(id);
    if (!record) return false;
    this.byId.delete(id);
    this.byKeyHash.delete(record.keyHash);
    await this.persist();
    return true;
  }
}
