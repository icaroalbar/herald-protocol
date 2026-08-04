import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentKeysDocument,
  parseAgentKeysDocument,
  createAgentKeyResolver,
  type SigningKeyEntry,
} from "./agent-keys.js";
import { generateSigningKeyPair, signRequest, verifyRequestSignature } from "./signature.js";

function fakeFetch(responses: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const entry = responses[url];
    if (!entry) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: entry.status >= 200 && entry.status < 300,
      status: entry.status,
      json: async () => entry.body,
    } as Response;
  }) as typeof fetch;
}

test("buildAgentKeysDocument / parseAgentKeysDocument fazem round-trip", () => {
  const key: SigningKeyEntry = {
    keyId: "k1",
    alg: "ed25519",
    publicKeyPem: "PEM",
    status: "active",
    notBefore: "2026-01-01T00:00:00Z",
  };
  const wire = buildAgentKeysDocument({ agentId: "vendor-agent/1.0", signingKeys: [key] });
  assert.equal(wire.agent_id, "vendor-agent/1.0");
  assert.equal(wire.signing_keys[0].key_id, "k1");
  assert.equal(wire.signing_keys[0].not_before, "2026-01-01T00:00:00Z");

  const parsed = parseAgentKeysDocument(wire);
  assert.deepEqual(parsed, {
    heraldVersion: "1.0",
    agentId: "vendor-agent/1.0",
    signingKeys: [key],
  });
});

test("parseAgentKeysDocument rejeita shapes invalidos sem lancar excecao", () => {
  assert.equal(parseAgentKeysDocument(null), null);
  assert.equal(parseAgentKeysDocument("string"), null);
  assert.equal(parseAgentKeysDocument({}), null);
  assert.equal(parseAgentKeysDocument({ agent_id: "a/1.0", signing_keys: "not-an-array" }), null);
  assert.equal(
    parseAgentKeysDocument({ agent_id: "a/1.0", signing_keys: [{ key_id: "k1" }] }),
    null,
    "chave sem alg/public_key_pem/status e invalida"
  );
  assert.equal(
    parseAgentKeysDocument({
      agent_id: "a/1.0",
      signing_keys: [{ key_id: "k1", alg: "rsa-not-supported", public_key_pem: "x", status: "active" }],
    }),
    null,
    "alg fora da lista suportada e invalido"
  );
});

test("createAgentKeyResolver: busca, confere agent_id, retorna chave ativa", async () => {
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [{ keyId: "k1", alg: "ed25519", publicKeyPem: "PEM-K1", status: "active" }],
  });
  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });

  const result = await resolver("k1", {
    agentId: "vendor-agent/1.0",
    headers: { "herald-agent-keys-url": keysUrl },
  });
  assert.equal(result, "PEM-K1");
});

test("createAgentKeyResolver: agent_id do documento nao bate com o declarado -> null", async () => {
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [{ keyId: "k1", alg: "ed25519", publicKeyPem: "PEM-K1", status: "active" }],
  });
  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });

  const result = await resolver("k1", {
    agentId: "outro-agente/9.9",
    headers: { "herald-agent-keys-url": keysUrl },
  });
  assert.equal(result, null);
});

test("createAgentKeyResolver: chave revogada e tratada como inexistente", async () => {
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [{ keyId: "k1", alg: "ed25519", publicKeyPem: "PEM-K1", status: "revoked" }],
  });
  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });

  const result = await resolver("k1", { agentId: "vendor-agent/1.0", headers: { "herald-agent-keys-url": keysUrl } });
  assert.equal(result, null);
});

test("createAgentKeyResolver: chave fora da janela not_before/not_after e tratada como inexistente", async () => {
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [
      { keyId: "k1", alg: "ed25519", publicKeyPem: "PEM-K1", status: "active", notAfter: "2020-01-01T00:00:00Z" },
    ],
  });
  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });

  const result = await resolver("k1", { agentId: "vendor-agent/1.0", headers: { "herald-agent-keys-url": keysUrl } });
  assert.equal(result, null);
});

test("createAgentKeyResolver: URL nao-https e rejeitada sem tentar fetch", async () => {
  const resolver = createAgentKeyResolver({
    fetchImpl: (() => {
      throw new Error("fetch nao deveria ser chamado");
    }) as unknown as typeof fetch,
  });
  const result = await resolver("k1", {
    agentId: "vendor-agent/1.0",
    headers: { "herald-agent-keys-url": "http://vendor.example/keys.json" },
  });
  assert.equal(result, null);
});

test("createAgentKeyResolver: sem Herald-Agent-Keys-Url no header -> null sem tentar fetch", async () => {
  const resolver = createAgentKeyResolver({
    fetchImpl: (() => {
      throw new Error("fetch nao deveria ser chamado");
    }) as unknown as typeof fetch,
  });
  const result = await resolver("k1", { agentId: "vendor-agent/1.0", headers: {} });
  assert.equal(result, null);
});

test("createAgentKeyResolver: cacheia por URL dentro do TTL (fetch chamado uma vez)", async () => {
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [{ keyId: "k1", alg: "ed25519", publicKeyPem: "PEM-K1", status: "active" }],
  });
  let fetchCalls = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    fetchCalls += 1;
    assert.equal(String(input), keysUrl);
    return { ok: true, status: 200, json: async () => doc } as Response;
  }) as typeof fetch;

  const resolver = createAgentKeyResolver({ fetchImpl, cacheTtlMs: 60_000 });
  const ctx = { agentId: "vendor-agent/1.0", headers: { "herald-agent-keys-url": keysUrl } };
  await resolver("k1", ctx);
  await resolver("k1", ctx);
  await resolver("k1", ctx);
  assert.equal(fetchCalls, 1);
});

test("integracao ponta a ponta: agente assina com Herald-Agent-Keys-Url, origem verifica via createAgentKeyResolver", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "vendor-agent/1.0",
    signingKeys: [{ keyId: "vendor-key-1", alg: "ed25519", publicKeyPem, status: "active" }],
  });

  const request = {
    method: "GET",
    path: "/artigos/exemplo",
    authority: "example.com",
    headers: {
      "herald-agent-id": "vendor-agent/1.0",
      "herald-agent-keys-url": keysUrl,
    },
  };

  const signed = signRequest({
    request,
    keyId: "vendor-key-1",
    alg: "ed25519",
    privateKeyPem,
    covered: ["@method", "@path", "@authority", "herald-agent-id", "herald-agent-keys-url"],
  });

  const signedRequest = {
    ...request,
    headers: { ...request.headers, "signature-input": signed["Signature-Input"], signature: signed.Signature },
  };

  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });
  const result = await verifyRequestSignature({ request: signedRequest, resolvePublicKey: resolver });

  assert.equal(result.valid, true);
  assert.equal(result.keyId, "vendor-key-1");
});

test("integracao: assinatura valida mas agent_id do documento nao bate -> verified=false", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const keysUrl = "https://vendor.example/.well-known/herald-agent-keys.json";
  const doc = buildAgentKeysDocument({
    agentId: "outro-agente/9.9",
    signingKeys: [{ keyId: "vendor-key-1", alg: "ed25519", publicKeyPem, status: "active" }],
  });

  const request = {
    method: "GET",
    path: "/artigos/exemplo",
    authority: "example.com",
    headers: { "herald-agent-id": "vendor-agent/1.0", "herald-agent-keys-url": keysUrl },
  };

  const signed = signRequest({
    request,
    keyId: "vendor-key-1",
    alg: "ed25519",
    privateKeyPem,
    covered: ["@method", "@path", "@authority", "herald-agent-id", "herald-agent-keys-url"],
  });

  const signedRequest = {
    ...request,
    headers: { ...request.headers, "signature-input": signed["Signature-Input"], signature: signed.Signature },
  };

  const resolver = createAgentKeyResolver({ fetchImpl: fakeFetch({ [keysUrl]: { status: 200, body: doc } }) });
  const result = await verifyRequestSignature({ request: signedRequest, resolvePublicKey: resolver });

  assert.equal(result.valid, false);
});
