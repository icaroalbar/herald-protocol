import * as crypto from "node:crypto";

/**
 * Verificação de identidade via HTTP Message Signatures (RFC 9421), conforme
 * RFC-0001 §4.4. Implementa um subconjunto prático da RFC 9421: um único rótulo de
 * assinatura ("sig1"), sem parâmetros de componente (`;req`, `;key`, etc.) e apenas os
 * componentes derivados mais úteis para o Herald Protocol (@method, @path, @authority,
 * @scheme) mais campos de header simples. Suficiente para o caso de uso do protocolo
 * (assinar a identidade declarada em Herald-Agent-Id); não é uma implementação genérica de
 * RFC 9421 para qualquer aplicação HTTP.
 */

export type SignatureAlgorithm = "ed25519" | "ecdsa-p256-sha256";

export interface SignatureParams {
  keyId: string;
  alg: SignatureAlgorithm;
  created?: number;
  expires?: number;
  nonce?: string;
}

export interface RequestLike {
  method: string;
  /** Path sem query string, ex: "/artigos/exemplo" (equivalente a @path da RFC 9421). */
  path: string;
  /** Host[:porta], ex: "example.com" (equivalente a @authority da RFC 9421). */
  authority: string;
  scheme?: "http" | "https";
  headers: Record<string, string | string[] | undefined>;
}

/** Componentes cobertos por padrão ao assinar: método, path, autoridade e a identidade declarada. */
export const DEFAULT_COVERED_COMPONENTS = ["@method", "@path", "@authority", "herald-agent-id"];

function getHeaderValue(headers: RequestLike["headers"], name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw.join(", ") : raw;
}

function resolveComponentValue(component: string, req: RequestLike): string {
  switch (component) {
    case "@method":
      return req.method.toUpperCase();
    case "@path":
      return req.path;
    case "@authority":
      return req.authority.toLowerCase();
    case "@scheme":
      return req.scheme ?? "https";
    default:
      return getHeaderValue(req.headers, component) ?? "";
  }
}

function serializeSignatureParams(components: string[], params: SignatureParams): string {
  const componentList = components.map((c) => `"${c}"`).join(" ");
  const parts: string[] = [];
  if (params.created !== undefined) parts.push(`created=${params.created}`);
  if (params.expires !== undefined) parts.push(`expires=${params.expires}`);
  parts.push(`keyid="${params.keyId}"`);
  parts.push(`alg="${params.alg}"`);
  if (params.nonce !== undefined) parts.push(`nonce="${params.nonce}"`);
  return `(${componentList});${parts.join(";")}`;
}

const SIG_PARAMS_PATTERN = /^\(([^)]*)\)((?:;[a-z]+=(?:"[^"]*"|-?[0-9]+))*)$/;

function parseSignatureParamsValue(value: string): { components: string[]; params: SignatureParams } | null {
  const match = SIG_PARAMS_PATTERN.exec(value.trim());
  if (!match) return null;

  const components = Array.from(match[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);

  let keyId: string | undefined;
  let alg: SignatureAlgorithm | undefined;
  let created: number | undefined;
  let expires: number | undefined;
  let nonce: string | undefined;

  for (const m of (match[2] ?? "").matchAll(/;([a-z]+)=("([^"]*)"|-?[0-9]+)/g)) {
    const key = m[1];
    const isQuoted = m[2].startsWith('"');
    const value2 = isQuoted ? m[3] : m[2];
    if (key === "created") created = Number(value2);
    else if (key === "expires") expires = Number(value2);
    else if (key === "keyid") keyId = value2;
    else if (key === "alg") alg = value2 as SignatureAlgorithm;
    else if (key === "nonce") nonce = value2;
  }

  if (!keyId || !alg) return null;
  return { components, params: { keyId, alg, created, expires, nonce } };
}

/** Parseia o header `Signature-Input: sig1=(...);created=...;keyid="...";alg="..."`. */
export function parseSignatureInputHeader(
  header: string
): { label: string; components: string[]; params: SignatureParams } | null {
  const eqIdx = header.indexOf("=");
  if (eqIdx === -1) return null;
  const label = header.slice(0, eqIdx).trim();
  const parsed = parseSignatureParamsValue(header.slice(eqIdx + 1));
  if (!parsed) return null;
  return { label, ...parsed };
}

/** Parseia o header `Signature: sig1=:base64:`. */
export function parseSignatureHeader(header: string): { label: string; signature: Buffer } | null {
  const eqIdx = header.indexOf("=");
  if (eqIdx === -1) return null;
  const label = header.slice(0, eqIdx).trim();
  const rest = header.slice(eqIdx + 1).trim();
  const match = /^:([A-Za-z0-9+/=]+):$/.exec(rest);
  if (!match) return null;
  return { label, signature: Buffer.from(match[1], "base64") };
}

/** Constrói a string-base assinada, conforme RFC 9421 §2.5 (subconjunto suportado). */
export function buildSignatureBase(components: string[], params: SignatureParams, req: RequestLike): string {
  const lines = components.map((c) => `"${c}": ${resolveComponentValue(c, req)}`);
  lines.push(`"@signature-params": ${serializeSignatureParams(components, params)}`);
  return lines.join("\n");
}

function rawSign(base: string, alg: SignatureAlgorithm, privateKeyPem: string): Buffer {
  const data = Buffer.from(base, "utf-8");
  return alg === "ed25519" ? crypto.sign(null, data, privateKeyPem) : crypto.sign("sha256", data, privateKeyPem);
}

function rawVerify(base: string, alg: SignatureAlgorithm, signature: Buffer, publicKeyPem: string): boolean {
  const data = Buffer.from(base, "utf-8");
  try {
    return alg === "ed25519"
      ? crypto.verify(null, data, publicKeyPem, signature)
      : crypto.verify("sha256", data, publicKeyPem, signature);
  } catch {
    return false;
  }
}

export interface SignRequestOptions {
  request: RequestLike;
  keyId: string;
  alg: SignatureAlgorithm;
  privateKeyPem: string;
  covered?: string[];
  /** default: agora, em segundos desde epoch */
  created?: number;
  /** se definido, seta `expires = created + expiresInSeconds` */
  expiresInSeconds?: number;
  nonce?: string;
}

export interface SignedHeaders {
  "Signature-Input": string;
  Signature: string;
}

/** Assina uma requisição (lado do agente) — produz os headers Signature-Input/Signature. */
export function signRequest(options: SignRequestOptions): SignedHeaders {
  const covered = options.covered ?? DEFAULT_COVERED_COMPONENTS;
  const created = options.created ?? Math.floor(Date.now() / 1000);
  const params: SignatureParams = {
    keyId: options.keyId,
    alg: options.alg,
    created,
    ...(options.expiresInSeconds !== undefined ? { expires: created + options.expiresInSeconds } : {}),
    ...(options.nonce !== undefined ? { nonce: options.nonce } : {}),
  };

  const base = buildSignatureBase(covered, params, options.request);
  const signature = rawSign(base, options.alg, options.privateKeyPem);

  return {
    "Signature-Input": `sig1=${serializeSignatureParams(covered, params)}`,
    Signature: `sig1=:${signature.toString("base64")}:`,
  };
}

/** Contexto adicional repassado a `resolvePublicKey`, além do keyid (RFC-0002). */
export interface ResolvePublicKeyContext {
  /** Herald-Agent-Id declarado na requisição, se presente (RFC-0001 §4.1). */
  agentId: string | null;
  /** Headers completos da requisição, para resolvers que precisam de headers adicionais (ex: Herald-Agent-Keys-Url). */
  headers: RequestLike["headers"];
}

export interface VerifyRequestSignatureOptions {
  request: RequestLike;
  /**
   * Resolve a chave pública (PEM, formato SPKI) a partir do keyid declarado na assinatura.
   * O segundo parâmetro (`context`) é opcional de usar — resolvers estáticos (ex: um Map
   * pré-configurado) podem ignorá-lo; resolvers de descoberta dinâmica (ver
   * `createAgentKeyResolver` em `agent-keys.ts`, RFC-0002) usam `context.agentId` e
   * `context.headers` para buscar e validar o documento de chaves do agente.
   */
  resolvePublicKey: (
    keyId: string,
    context: ResolvePublicKeyContext
  ) => string | null | undefined | Promise<string | null | undefined>;
  /** Idade máxima aceita para `created`, em segundos (default 300 = 5 min). */
  maxAgeSeconds?: number;
}

export interface VerifyRequestSignatureResult {
  valid: boolean;
  reason?: string;
  keyId?: string;
}

/** Verifica uma requisição assinada (lado da origem) — usado para popular AgentContext.verified. */
export async function verifyRequestSignature(
  options: VerifyRequestSignatureOptions
): Promise<VerifyRequestSignatureResult> {
  const sigInputHeader = getHeaderValue(options.request.headers, "signature-input");
  const sigHeader = getHeaderValue(options.request.headers, "signature");
  if (!sigInputHeader || !sigHeader) {
    return { valid: false, reason: "Signature-Input ou Signature ausente" };
  }

  const parsedInput = parseSignatureInputHeader(sigInputHeader);
  const parsedSig = parseSignatureHeader(sigHeader);
  if (!parsedInput || !parsedSig || parsedInput.label !== parsedSig.label) {
    return { valid: false, reason: "headers de assinatura malformados" };
  }

  const { components, params } = parsedInput;
  const maxAge = options.maxAgeSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);

  if (params.created !== undefined && now - params.created > maxAge) {
    return { valid: false, reason: "assinatura expirada (created muito antigo)", keyId: params.keyId };
  }
  if (params.expires !== undefined && now > params.expires) {
    return { valid: false, reason: "assinatura expirada (passou de expires)", keyId: params.keyId };
  }

  const declaredAgentId = getHeaderValue(options.request.headers, "herald-agent-id") ?? null;
  const publicKeyPem = await options.resolvePublicKey(params.keyId, {
    agentId: declaredAgentId,
    headers: options.request.headers,
  });
  if (!publicKeyPem) {
    return { valid: false, reason: `chave publica desconhecida para keyid="${params.keyId}"`, keyId: params.keyId };
  }

  const base = buildSignatureBase(components, params, options.request);
  const ok = rawVerify(base, params.alg, parsedSig.signature, publicKeyPem);

  return ok ? { valid: true, keyId: params.keyId } : { valid: false, reason: "assinatura invalida", keyId: params.keyId };
}

/** Gera um par de chaves PEM para assinatura — uso em testes, demos e provisionamento inicial. */
export function generateSigningKeyPair(alg: SignatureAlgorithm = "ed25519"): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } =
    alg === "ed25519" ? crypto.generateKeyPairSync("ed25519") : crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}
