import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSigningKeyPair,
  signRequest,
  verifyRequestSignature,
  type RequestLike,
  type SignedHeaders,
} from "./signature.js";

/**
 * signRequest() retorna os headers com capitalizacao "de exibicao" (Signature-Input,
 * Signature) — no transporte HTTP real, Node/Express sempre normalizam nomes de header
 * para minusculo antes de expor via req.headers. Simulamos isso aqui para que os testes
 * reflitam o comportamento real (ver gateway.ts).
 */
function toLowerHeaders(headers: SignedHeaders): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

function baseRequest(extraHeaders: Record<string, string> = {}): RequestLike {
  return {
    method: "GET",
    path: "/artigos/exemplo",
    authority: "example.com",
    headers: { "herald-agent-id": "anthropic-claude/1.0", ...extraHeaders },
  };
}

test("round-trip valido com ed25519", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const signed = signRequest({ request, keyId: "key-1", alg: "ed25519", privateKeyPem });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: (keyId) => (keyId === "key-1" ? publicKeyPem : null),
  });

  assert.equal(result.valid, true);
  assert.equal(result.keyId, "key-1");
});

test("round-trip valido com ecdsa-p256-sha256", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ecdsa-p256-sha256");
  const request = baseRequest();
  const signed = signRequest({ request, keyId: "key-2", alg: "ecdsa-p256-sha256", privateKeyPem });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: (keyId) => (keyId === "key-2" ? publicKeyPem : null),
  });

  assert.equal(result.valid, true);
});

test("chave errada (impostor) e rejeitada mesmo reivindicando o keyid correto", async () => {
  const real = generateSigningKeyPair("ed25519");
  const impostor = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const signed = signRequest({ request, keyId: "key-1", alg: "ed25519", privateKeyPem: impostor.privateKeyPem });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: (keyId) => (keyId === "key-1" ? real.publicKeyPem : null),
  });

  assert.equal(result.valid, false);
});

test("componente coberto alterado apos assinar invalida a assinatura", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const signed = signRequest({ request, keyId: "key-1", alg: "ed25519", privateKeyPem });

  const tamperedRequest: RequestLike = {
    ...request,
    headers: { ...request.headers, ...toLowerHeaders(signed), "herald-agent-id": "outro-agente/9.9" },
  };

  const result = await verifyRequestSignature({ request: tamperedRequest, resolvePublicKey: () => publicKeyPem });

  assert.equal(result.valid, false);
});

test("assinatura com created fora da janela (maxAgeSeconds) e rejeitada", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const oldCreated = Math.floor(Date.now() / 1000) - 1000;
  const signed = signRequest({ request, keyId: "key-1", alg: "ed25519", privateKeyPem, created: oldCreated });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: () => publicKeyPem,
    maxAgeSeconds: 300,
  });

  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /expirada/);
});

test("assinatura com expires no passado e rejeitada", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const created = Math.floor(Date.now() / 1000) - 10;
  const signed = signRequest({
    request,
    keyId: "key-1",
    alg: "ed25519",
    privateKeyPem,
    created,
    expiresInSeconds: 1, // created + 1s, ja passou
  });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: () => publicKeyPem,
  });

  assert.equal(result.valid, false);
});

test("keyid desconhecido e rejeitado com motivo explicito", async () => {
  const { privateKeyPem } = generateSigningKeyPair("ed25519");
  const request = baseRequest();
  const signed = signRequest({ request, keyId: "key-desconhecida", alg: "ed25519", privateKeyPem });

  const result = await verifyRequestSignature({
    request: { ...request, headers: { ...request.headers, ...toLowerHeaders(signed) } },
    resolvePublicKey: () => null,
  });

  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /chave publica desconhecida/);
});

test("Signature-Input/Signature ausentes nao lancam excecao", async () => {
  const result = await verifyRequestSignature({ request: baseRequest(), resolvePublicKey: () => null });
  assert.equal(result.valid, false);
});

test("Signature malformado nao lanca excecao", async () => {
  const request = baseRequest({
    "signature-input": 'sig1=("@method" "@path" "@authority" "herald-agent-id");created=1;keyid="k";alg="ed25519"',
    signature: "sig1=nao-eh-base64-entre-dois-pontos",
  });
  const result = await verifyRequestSignature({ request, resolvePublicKey: () => null });
  assert.equal(result.valid, false);
});

test("generateSigningKeyPair retorna PEM validos para os dois algoritmos", () => {
  const ed = generateSigningKeyPair("ed25519");
  assert.match(ed.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(ed.privateKeyPem, /BEGIN PRIVATE KEY/);

  const ec = generateSigningKeyPair("ecdsa-p256-sha256");
  assert.match(ec.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(ec.privateKeyPem, /BEGIN PRIVATE KEY/);
});
