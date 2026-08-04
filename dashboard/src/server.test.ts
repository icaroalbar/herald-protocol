import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createDashboardApp } from "./server.js";

/**
 * fetchGatewayMetrics() usa o `fetch` global (nativo do Node >=18) — mockamos
 * `globalThis.fetch` diretamente em vez de subir servidores HTTP reais, já que o
 * objetivo aqui é testar a lógica de agregação do Dashboard, não a rede.
 */
function mockFetch(handler: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>) {
  const original = globalThis.fetch;
  // @ts-expect-error -- assinatura simplificada o suficiente para os testes abaixo.
  globalThis.fetch = async (url: string) => handler(url);
  return () => {
    globalThis.fetch = original;
  };
}

const snapshotOf = (agentId: string) => ({
  requestsByAgent: { [agentId]: 3 },
  decisionsByResult: { allow: 3 },
  formatsServed: { html: 3 },
  errorsByAgent: {},
  averageLatencyMs: 12,
  sampleCount: 3,
});

test("agrega metricas de multiplos Gateways com sucesso", async () => {
  const restore = mockFetch(async (url) => {
    if (url === "http://gw-a/metrics") return { ok: true, json: async () => snapshotOf("bot-a/1.0") };
    if (url === "http://gw-b/metrics") return { ok: true, json: async () => snapshotOf("bot-b/1.0") };
    throw new Error(`URL inesperada: ${url}`);
  });

  try {
    const { app } = createDashboardApp({
      gateways: [
        { name: "a", metricsUrl: "http://gw-a/metrics" },
        { name: "b", metricsUrl: "http://gw-b/metrics" },
      ],
    });

    const res = await request(app).get("/api/metrics");
    assert.equal(res.status, 200);
    assert.equal(res.body.gateways.length, 2);

    const a = res.body.gateways.find((g: { name: string }) => g.name === "a");
    const b = res.body.gateways.find((g: { name: string }) => g.name === "b");
    assert.equal(a.ok, true);
    assert.equal(a.data.requestsByAgent["bot-a/1.0"], 3);
    assert.equal(b.ok, true);
    assert.equal(b.data.requestsByAgent["bot-b/1.0"], 3);
  } finally {
    restore();
  }
});

test("um Gateway fora do ar (fetch rejeita) nao derruba a agregacao dos demais", async () => {
  const restore = mockFetch(async (url) => {
    if (url === "http://gw-ok/metrics") return { ok: true, json: async () => snapshotOf("bot-ok/1.0") };
    if (url === "http://gw-down/metrics") throw new Error("fetch failed: ECONNREFUSED");
    throw new Error(`URL inesperada: ${url}`);
  });

  try {
    const { app } = createDashboardApp({
      gateways: [
        { name: "ok", metricsUrl: "http://gw-ok/metrics" },
        { name: "down", metricsUrl: "http://gw-down/metrics" },
      ],
    });

    const res = await request(app).get("/api/metrics");
    assert.equal(res.status, 200);

    const ok = res.body.gateways.find((g: { name: string }) => g.name === "ok");
    const down = res.body.gateways.find((g: { name: string }) => g.name === "down");
    assert.equal(ok.ok, true);
    assert.equal(ok.data.requestsByAgent["bot-ok/1.0"], 3);
    assert.equal(down.ok, false);
    assert.match(down.error, /ECONNREFUSED/);
  } finally {
    restore();
  }
});

test("Gateway respondendo com status HTTP de erro vira ok:false com o status no erro", async () => {
  const restore = mockFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));

  try {
    const { app } = createDashboardApp({ gateways: [{ name: "flaky", metricsUrl: "http://gw-flaky/metrics" }] });
    const res = await request(app).get("/api/metrics");
    assert.equal(res.status, 200);
    assert.equal(res.body.gateways[0].ok, false);
    assert.equal(res.body.gateways[0].error, "HTTP 503");
  } finally {
    restore();
  }
});

test("resposta inclui fetchedAt e pollIntervalMs do config", async () => {
  const restore = mockFetch(async () => ({ ok: true, json: async () => snapshotOf("bot/1.0") }));

  try {
    const { app } = createDashboardApp({
      gateways: [{ name: "a", metricsUrl: "http://gw-a/metrics" }],
      pollIntervalMs: 1234,
    });
    const res = await request(app).get("/api/metrics");
    assert.equal(res.body.pollIntervalMs, 1234);
    assert.ok(typeof res.body.fetchedAt === "string" && !Number.isNaN(Date.parse(res.body.fetchedAt)));
  } finally {
    restore();
  }
});

test("sem Gateways configurados, /api/metrics retorna lista vazia sem erro", async () => {
  const { app } = createDashboardApp({ gateways: [] });
  const res = await request(app).get("/api/metrics");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.gateways, []);
});

test("serve os arquivos estaticos do public/ (index.html na raiz)", async () => {
  const { app } = createDashboardApp({ gateways: [] });
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /html/);
});
