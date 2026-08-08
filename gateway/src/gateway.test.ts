import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { generateSigningKeyPair, signRequest, createDemoPaymentVerifier, type PaymentRequirements } from "@heraldserver/sdk";
import { createHeraldGateway, type HeraldGatewayConfig } from "./gateway.js";
import { getHeraldContext } from "./context.js";

/**
 * Monta um app Express mínimo em torno do Gateway, com uma rota downstream que expõe o
 * HeraldRequestContext (para validar o caminho "sem formatter -> next()") e um error handler
 * (para validar o caminho "formatter lança -> next(err)").
 */
function buildApp(config: HeraldGatewayConfig) {
  const gateway = createHeraldGateway(config);
  const app = express();
  app.use(gateway.router);
  app.get("/artigos/:slug", (req: Request, res: Response) => {
    const ctx = getHeraldContext(req);
    res.status(200).json({ downstream: true, format: ctx?.format ?? null, matched: ctx?.matched ?? null });
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "internal", message: err instanceof Error ? err.message : String(err) });
  });
  return { app, gateway };
}

const baseDiscovery = { origin: "https://example.com", capabilities: ["html"], defaultPolicy: { read: "allow" as const } };

test("GET /.well-known/herald retorna o documento de descoberta com Cache-Control", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  const res = await request(app).get("/.well-known/herald");
  assert.equal(res.status, 200);
  assert.equal(res.body.origin, "https://example.com");
  assert.equal(res.headers["cache-control"], "max-age=3600");
});

test("GET /metrics retorna o snapshot do InMemoryMetricsCollector padrão", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.equal(res.body.requestsByAgent["test-bot/1.0"], 1);
});

test("GET /metrics com MetricsCollector customizado sem snapshot()/renderPrometheus() retorna 501", async () => {
  const customMetrics = {
    incrementRequest: () => {},
    recordPolicyDecision: () => {},
    recordFormat: () => {},
    recordError: () => {},
    recordLatency: () => {},
  };
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } }, metrics: customMetrics });
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 501);
});

test("GET /metrics com MetricsCollector que implementa renderPrometheus() serve o texto e Content-Type dele", async () => {
  const prometheusMetrics = {
    incrementRequest: () => {},
    recordPolicyDecision: () => {},
    recordFormat: () => {},
    recordError: () => {},
    recordLatency: () => {},
    renderPrometheus: async () => ({
      contentType: "text/plain; version=0.0.4; charset=utf-8",
      body: "herald_requests_total 1\n",
    }),
  };
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } }, metrics: prometheusMetrics });
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /^text\/plain;.*version=0\.0\.4/);
  assert.equal(res.text, "herald_requests_total 1\n");
});

test("requisição sem headers Herald passa direto (source none): sem headers Herald-*, next() chamado", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  const res = await request(app).get("/artigos/x");
  assert.equal(res.status, 200);
  assert.equal(res.body.downstream, true);
  assert.equal(res.headers["herald-policy-decision"], undefined);
  assert.equal(res.headers["herald-content-format"], undefined);
  assert.equal(res.headers["x-herald-debug-agent-verified"], undefined);
});

test("requisição sem headers Herald ainda conta em /metrics, sob a chave unknown:unknown", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  await request(app).get("/artigos/x");
  await request(app).get("/artigos/y");
  const res = await request(app).get("/metrics");
  assert.equal(res.body.requestsByAgent["unknown:unknown"], 2);
});

test("agente identificado com policy allow: define Herald-Policy-Decision/Vary e chama next()", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 200);
  assert.equal(res.body.downstream, true);
  assert.equal(res.headers["herald-policy-decision"], "intent=read; result=allow; rule=default");
  assert.equal(res.headers["vary"], "Herald-Agent-Id, Herald-Accept-Capabilities");
});

test("policy deny curto-circuita com 403 e nao chama next()", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "deny" } } });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "denied");
  assert.equal(res.body.downstream, undefined);
});

test("policy ask curto-circuita com 402", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "ask" } } });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 402);
  assert.equal(res.body.error, "ask");
});

test("rate limit excedido retorna 429 com Retry-After apos o limite ser atingido", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow", rateLimit: { requests: 1, windowSeconds: 60 } } },
  });
  const headers = { "Herald-Agent-Id": "test-bot/1.0", "Herald-Agent-Type": "crawler" };

  const first = await request(app).get("/artigos/x").set(headers);
  assert.equal(first.status, 200);

  const second = await request(app).get("/artigos/x").set(headers);
  assert.equal(second.status, 429);
  assert.equal(second.body.error, "rate_limited");
  assert.ok(Number(second.headers["retry-after"]) > 0);
});

test("rate limit e por chave de agente: outro agentId nao e afetado pelo limite do primeiro", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow", rateLimit: { requests: 1, windowSeconds: 60 } } },
  });

  const a = await request(app).get("/artigos/x").set("Herald-Agent-Id", "bot-a/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(a.status, 200);
  const aAgain = await request(app).get("/artigos/x").set("Herald-Agent-Id", "bot-a/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(aAgain.status, 429);

  const b = await request(app).get("/artigos/x").set("Herald-Agent-Id", "bot-b/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(b.status, 200);
});

test("rate limit sob concorrencia real (requisicoes em paralelo): exatamente N passam", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow", rateLimit: { requests: 3, windowSeconds: 60 } } },
  });
  const headers = { "Herald-Agent-Id": "test-bot/1.0", "Herald-Agent-Type": "crawler" };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => request(app).get("/artigos/x").set(headers))
  );
  const ok = results.filter((r) => r.status === 200).length;
  const limited = results.filter((r) => r.status === 429).length;

  assert.equal(ok, 3);
  assert.equal(limited, 7);
});

test("formatter registrado responde diretamente (nao chama a rota downstream)", async () => {
  const { app, gateway } = buildApp({
    discovery: { origin: "https://example.com", capabilities: ["structured-json", "html"], defaultPolicy: { read: "allow" } },
    policy: { default: { read: "allow" } },
  });
  gateway.formatters.register("/artigos/*", "structured-json", async () => ({ title: "Exemplo" }));

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Herald-Accept-Capabilities", "structured-json;q=1.0");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { title: "Exemplo" });
  assert.equal(res.headers["herald-content-format"], "structured-json");
});

test("formatter registry com padroes conflitantes: usa o primeiro registrado para o mesmo (pattern, format)", async () => {
  const { app, gateway } = buildApp({
    discovery: { origin: "https://example.com", capabilities: ["structured-json"], defaultPolicy: { read: "allow" } },
    policy: { default: { read: "allow" } },
  });
  gateway.formatters.register("/artigos/*", "structured-json", async () => ({ from: "generico" }));
  gateway.formatters.register("/artigos/x", "structured-json", async () => ({ from: "especifico" }));

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Herald-Accept-Capabilities", "structured-json;q=1.0");

  // FormatterRegistry.resolve() usa Array.find(): a primeira entrada registrada que casar
  // vence, mesmo que uma entrada posterior seja um match mais especifico. Documentado aqui
  // como comportamento atual (nao um "melhor match" por especificidade).
  assert.deepEqual(res.body, { from: "generico" });
});

test("erro lancado por um formatter e propagado para o error handler (next(err))", async () => {
  const { app, gateway } = buildApp({
    discovery: { origin: "https://example.com", capabilities: ["structured-json"], defaultPolicy: { read: "allow" } },
    policy: { default: { read: "allow" } },
  });
  gateway.formatters.register("/artigos/*", "structured-json", async () => {
    throw new Error("boom");
  });

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Herald-Accept-Capabilities", "structured-json;q=1.0");

  assert.equal(res.status, 500);
  assert.equal(res.body.error, "internal");
  assert.match(res.body.message, /boom/);
});

test("sem formatter para (recurso, formato) e sem Herald-Accept-Capabilities: cai no fallback 'html' (matched=false) e chama next()", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 200);
  assert.equal(res.body.downstream, true);
  assert.equal(res.body.format, "html");
  assert.equal(res.body.matched, false);
  // Sem match real, o Gateway nao anuncia Herald-Content-Format (RFC-0001 §5.4.5).
  assert.equal(res.headers["herald-content-format"], undefined);
});

test("Herald-Accept-Capabilities casando com uma capability suportada: matched=true e header Herald-Content-Format setado", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });
  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Herald-Accept-Capabilities", "html;q=1.0");
  assert.equal(res.status, 200);
  assert.equal(res.body.format, "html");
  assert.equal(res.body.matched, true);
  assert.equal(res.headers["herald-content-format"], "html");
});

test("signatureVerification: assinatura valida promove X-Herald-Debug-Agent-Verified para true", async () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair("ed25519");
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow" } },
    signatureVerification: { resolvePublicKey: (keyId) => (keyId === "key-1" ? publicKeyPem : null) },
  });

  const signed = signRequest({
    request: { method: "GET", path: "/artigos/x", authority: "example.com", headers: { "herald-agent-id": "test-bot/1.0" } },
    keyId: "key-1",
    alg: "ed25519",
    privateKeyPem,
  });

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Signature-Input", signed["Signature-Input"])
    .set("Signature", signed.Signature)
    .set("Host", "example.com");

  assert.equal(res.headers["x-herald-debug-agent-verified"], "true");
});

test("signatureVerification: sem headers de assinatura permanece verified=false, sem lancar erro", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow" } },
    signatureVerification: { resolvePublicKey: () => null },
  });

  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-herald-debug-agent-verified"], "false");
});

test("signatureVerification: assinatura de outra chave (impostor) mantem verified=false", async () => {
  const real = generateSigningKeyPair("ed25519");
  const impostor = generateSigningKeyPair("ed25519");
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow" } },
    signatureVerification: { resolvePublicKey: (keyId) => (keyId === "key-1" ? real.publicKeyPem : null) },
  });

  const signed = signRequest({
    request: { method: "GET", path: "/artigos/x", authority: "example.com", headers: { "herald-agent-id": "test-bot/1.0" } },
    keyId: "key-1",
    alg: "ed25519",
    privateKeyPem: impostor.privateKeyPem,
  });

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Signature-Input", signed["Signature-Input"])
    .set("Signature", signed.Signature)
    .set("Host", "example.com");

  assert.equal(res.headers["x-herald-debug-agent-verified"], "false");
});

test("sem signatureVerification configurado, o Gateway nunca tenta verificar (verified permanece false)", async () => {
  const { privateKeyPem } = generateSigningKeyPair("ed25519");
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });

  const signed = signRequest({
    request: { method: "GET", path: "/artigos/x", authority: "example.com", headers: { "herald-agent-id": "test-bot/1.0" } },
    keyId: "key-1",
    alg: "ed25519",
    privateKeyPem,
  });

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Signature-Input", signed["Signature-Input"])
    .set("Signature", signed.Signature)
    .set("Host", "example.com");

  // Sem signatureVerification configurado, o header de debug nem chega a ser calculado
  // via verifyRequestSignature -- mas ainda e setado com o valor default (false).
  assert.equal(res.headers["x-herald-debug-agent-verified"], "false");
});

const premiumRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "1000",
  asset: "0xUSDC",
  payTo: "0xDestino",
  resource: "/artigos/x",
};

test("ask sem monetization configurado: comportamento inalterado (402 puro, sem Payment-Required)", async () => {
  const { app } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "ask" } } });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 402);
  assert.equal(res.body.error, "ask");
  assert.equal(res.headers["payment-required"], undefined);
});

test("ask com monetization mas resolveRequirements retorna null: cai no 402 puro", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "ask" } },
    monetization: { resolveRequirements: () => null, verifier: createDemoPaymentVerifier() },
  });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 402);
  assert.equal(res.headers["payment-required"], undefined);
});

test("ask com monetization, primeira tentativa sem Payment-Signature: 402 com header Payment-Required", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "ask" } },
    monetization: { resolveRequirements: () => premiumRequirements, verifier: createDemoPaymentVerifier() },
  });
  const res = await request(app).get("/artigos/x").set("Herald-Agent-Id", "test-bot/1.0").set("Herald-Agent-Type", "crawler");
  assert.equal(res.status, 402);
  assert.equal(res.body.error, "ask");
  assert.ok(res.headers["payment-required"]);
  const decoded = JSON.parse(Buffer.from(res.headers["payment-required"], "base64").toString("utf-8"));
  assert.deepEqual(decoded.accepts, [premiumRequirements]);
});

test("ask com monetization e Payment-Signature valido (valor suficiente): segue o pipeline e responde 200 com Payment-Response de sucesso", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "ask" } },
    monetization: { resolveRequirements: () => premiumRequirements, verifier: createDemoPaymentVerifier() },
  });
  const paymentPayload = { scheme: "exact", network: "base-sepolia", payload: { amount: "1500", payer: "0xAgente" } };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString("base64");

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Payment-Signature", paymentHeader);

  assert.equal(res.status, 200);
  assert.equal(res.body.downstream, true);
  assert.ok(res.headers["payment-response"]);
  const decoded = JSON.parse(Buffer.from(res.headers["payment-response"], "base64").toString("utf-8"));
  assert.equal(decoded.success, true);
  assert.equal(decoded.payer, "0xAgente");
});

test("ask com monetization e Payment-Signature com valor insuficiente: 402 novamente, com Payment-Response de falha", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "ask" } },
    monetization: { resolveRequirements: () => premiumRequirements, verifier: createDemoPaymentVerifier() },
  });
  const paymentPayload = { scheme: "exact", network: "base-sepolia", payload: { amount: "1", payer: "0xAgente" } };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString("base64");

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Payment-Signature", paymentHeader);

  assert.equal(res.status, 402);
  assert.ok(res.headers["payment-required"]);
  const settlement = JSON.parse(Buffer.from(res.headers["payment-response"], "base64").toString("utf-8"));
  assert.equal(settlement.success, false);
  assert.equal(settlement.errorReason, "valor_insuficiente");
});

test("ask com monetization e Payment-Signature malformado: tratado como se nao houvesse pagamento (402 + Payment-Required)", async () => {
  const { app } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "ask" } },
    monetization: { resolveRequirements: () => premiumRequirements, verifier: createDemoPaymentVerifier() },
  });

  const res = await request(app)
    .get("/artigos/x")
    .set("Herald-Agent-Id", "test-bot/1.0")
    .set("Herald-Agent-Type", "crawler")
    .set("Payment-Signature", "nao-e-base64-json-valido");

  assert.equal(res.status, 402);
  assert.ok(res.headers["payment-required"]);
  assert.equal(res.headers["payment-response"], undefined);
});

test("reporting: startReporting() empurra o snapshot pro Server periodicamente, stopReporting() interrompe", async () => {
  let callCount = 0;
  let lastAuth = "";
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    callCount += 1;
    lastAuth = (init?.headers as Record<string, string>)?.authorization ?? "";
    return { ok: true } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;

  const { gateway } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow" } },
    reporting: { serverUrl: "https://server.local", outpostKey: "hrld_op_test", intervalMs: 15, fetchImpl },
  });

  gateway.startReporting();
  gateway.startReporting(); // idempotente
  await new Promise((resolve) => setTimeout(resolve, 60));
  gateway.stopReporting();

  const countAfterStop = callCount;
  assert.ok(countAfterStop >= 2, `esperava >=2 chamadas, teve ${countAfterStop}`);
  assert.equal(lastAuth, "Bearer hrld_op_test");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(callCount, countAfterStop, "nao deveria crescer mais apos stopReporting()");
});

test("reporting: sem config.reporting, startReporting()/stopReporting() sao no-ops seguros (sem timer, sem fetch)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return { ok: true } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;

  const { gateway } = buildApp({ discovery: baseDiscovery, policy: { default: { read: "allow" } } });

  assert.doesNotThrow(() => gateway.startReporting());
  assert.doesNotThrow(() => gateway.stopReporting());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(called, false);
  void fetchImpl; // referenciado só pra deixar claro que nao deveria ser chamado
});

test("reporting: MetricsCollector customizado (nao InMemoryMetricsCollector) + reporting configurado -> no-op seguro", async () => {
  const customMetrics = {
    incrementRequest: () => {},
    recordPolicyDecision: () => {},
    recordFormat: () => {},
    recordError: () => {},
    recordLatency: () => {},
  };
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return { ok: true } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;

  const { gateway } = buildApp({
    discovery: baseDiscovery,
    policy: { default: { read: "allow" } },
    metrics: customMetrics,
    reporting: { serverUrl: "https://x", outpostKey: "k", intervalMs: 10, fetchImpl },
  });

  assert.doesNotThrow(() => gateway.startReporting());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(called, false);
  gateway.stopReporting();
});
