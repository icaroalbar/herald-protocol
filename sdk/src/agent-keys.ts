import type { SignatureAlgorithm } from "./signature.js";
import type { ResolvePublicKeyContext } from "./signature.js";

/**
 * Descoberta de chave pública do agente (RFC-0002), implementação de referência. Ver
 * herald-agent-keys.schema.json (raiz do repositório) para o formato normativo do
 * documento buscado via Herald-Agent-Keys-Url.
 */

export interface SigningKeyEntry {
  keyId: string;
  alg: SignatureAlgorithm;
  publicKeyPem: string;
  status: "active" | "revoked";
  /** ISO-8601. Ausente = sem limite inferior de validade. */
  notBefore?: string;
  /** ISO-8601. Ausente = sem limite superior de validade. */
  notAfter?: string;
}

export interface AgentKeysDocument {
  heraldVersion: string;
  agentId: string;
  signingKeys: SigningKeyEntry[];
}

/** Constrói o documento de chaves do agente (lado do provedor de agente, RFC-0002 §3). */
export function buildAgentKeysDocument(config: {
  agentId: string;
  signingKeys: SigningKeyEntry[];
  heraldVersion?: string;
}) {
  return {
    herald_version: config.heraldVersion ?? "1.0",
    agent_id: config.agentId,
    signing_keys: config.signingKeys.map((k) => ({
      key_id: k.keyId,
      alg: k.alg,
      public_key_pem: k.publicKeyPem,
      status: k.status,
      ...(k.notBefore !== undefined ? { not_before: k.notBefore } : {}),
      ...(k.notAfter !== undefined ? { not_after: k.notAfter } : {}),
    })),
  };
}

const VALID_ALGS: SignatureAlgorithm[] = ["ed25519", "ecdsa-p256-sha256"];

/** Parseia e valida defensivamente uma resposta de rede não confiável contra o shape esperado. */
export function parseAgentKeysDocument(raw: unknown): AgentKeysDocument | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.agent_id !== "string" || !Array.isArray(obj.signing_keys)) return null;

  const signingKeys: SigningKeyEntry[] = [];
  for (const item of obj.signing_keys) {
    if (typeof item !== "object" || item === null) return null;
    const k = item as Record<string, unknown>;
    if (
      typeof k.key_id !== "string" ||
      typeof k.alg !== "string" ||
      !VALID_ALGS.includes(k.alg as SignatureAlgorithm) ||
      typeof k.public_key_pem !== "string" ||
      (k.status !== "active" && k.status !== "revoked")
    ) {
      return null;
    }
    signingKeys.push({
      keyId: k.key_id,
      alg: k.alg as SignatureAlgorithm,
      publicKeyPem: k.public_key_pem,
      status: k.status,
      ...(typeof k.not_before === "string" ? { notBefore: k.not_before } : {}),
      ...(typeof k.not_after === "string" ? { notAfter: k.not_after } : {}),
    });
  }

  return {
    heraldVersion: typeof obj.herald_version === "string" ? obj.herald_version : "1.0",
    agentId: obj.agent_id,
    signingKeys,
  };
}

function withinValidityWindow(entry: SigningKeyEntry, now: Date): boolean {
  if (entry.notBefore && new Date(entry.notBefore) > now) return false;
  if (entry.notAfter && new Date(entry.notAfter) < now) return false;
  return true;
}

export interface CreateAgentKeyResolverOptions {
  /** Implementação de fetch a usar (testes/proxies); default: fetch global. */
  fetchImpl?: typeof fetch;
  /** TTL do cache em memória do documento buscado, por URL, em ms (default 5 min). */
  cacheTtlMs?: number;
}

/**
 * Cria um resolvedor de chave pública compatível com
 * `VerifyRequestSignatureOptions.resolvePublicKey` (signature.ts) que implementa a
 * descoberta dinâmica da RFC-0002: lê `Herald-Agent-Keys-Url` de `context.headers`, busca
 * o documento (com cache por URL e TTL), confere que `agent_id` bate com
 * `context.agentId`, e retorna a chave ativa e dentro da janela de validade
 * correspondente ao `keyId` pedido.
 *
 * Retorna `null` (chave não encontrada) para qualquer falha — URL ausente, fetch
 * falhando, `agent_id` não batendo, chave ausente/revogada/fora da janela — nunca lança
 * exceção, consistente com o contrato existente de `resolvePublicKey`.
 */
export function createAgentKeyResolver(options: CreateAgentKeyResolverOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, { doc: AgentKeysDocument | null; fetchedAt: number }>();

  async function fetchDocument(keysUrl: string): Promise<AgentKeysDocument | null> {
    const cached = cache.get(keysUrl);
    if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) return cached.doc;

    let doc: AgentKeysDocument | null = null;
    try {
      const res = await fetchImpl(keysUrl);
      if (res.ok) doc = parseAgentKeysDocument(await res.json());
    } catch {
      doc = null;
    }
    cache.set(keysUrl, { doc, fetchedAt: Date.now() });
    return doc;
  }

  return async function resolvePublicKey(
    keyId: string,
    context: ResolvePublicKeyContext
  ): Promise<string | null> {
    const keysUrlHeader = context.headers["herald-agent-keys-url"] ?? context.headers["Herald-Agent-Keys-Url"];
    const keysUrl = Array.isArray(keysUrlHeader) ? keysUrlHeader[0] : keysUrlHeader;
    if (!keysUrl || !keysUrl.startsWith("https://")) return null;

    const doc = await fetchDocument(keysUrl);
    if (!doc || doc.agentId !== context.agentId) return null;

    const now = new Date();
    const entry = doc.signingKeys.find((k) => k.keyId === keyId && k.status === "active" && withinValidityWindow(k, now));
    return entry?.publicKeyPem ?? null;
  };
}
