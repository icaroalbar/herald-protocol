import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboardApp, pollOnce, type DashboardApp } from "./server.js";
import { MetricsHistoryStore } from "./history.js";
import { type DashboardConfig } from "./config.js";

/**
 * testApp() agora persiste Outposts em disco (OutpostStore) — sem isso, todo
 * teste leria/escreveria dashboard/data/outposts.json de verdade e se contaminaria entre
 * execuções. Cada teste recebe um arquivo temporário isolado.
 */
function testApp(overrides: Partial<DashboardConfig> = {}): DashboardApp {
  const dir = mkdtempSync(join(tmpdir(), "herald-dashboard-test-"));
  return createDashboardApp({ outpostsFilePath: join(dir, "outposts.json"), ...overrides });
}

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
    const { app } = testApp({
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
    const { app } = testApp({
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
    const { app } = testApp({ gateways: [{ name: "flaky", metricsUrl: "http://gw-flaky/metrics" }] });
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
    const { app } = testApp({
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
  const { app } = testApp({ gateways: [] });
  const res = await request(app).get("/api/metrics");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.gateways, []);
});

test("serve os arquivos estaticos do public/ (index.html na raiz)", async () => {
  const { app } = testApp({ gateways: [] });
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /html/);
});

test("pollOnce grava uma amostra no MetricsHistoryStore por Gateway", async () => {
  const restore = mockFetch(async (url) => {
    if (url === "http://gw-a/metrics") return { ok: true, json: async () => snapshotOf("bot-a/1.0") };
    throw new Error(`URL inesperada: ${url}`);
  });

  try {
    const config = { port: 0, pollIntervalMs: 1000, historySize: 60, outpostsFilePath: "", gateways: [{ name: "a", metricsUrl: "http://gw-a/metrics" }] };
    const historyStore = new MetricsHistoryStore(config.historySize);

    await pollOnce(config, historyStore);
    await pollOnce(config, historyStore);

    const snap = historyStore.snapshot();
    assert.equal(snap.a.length, 2);
    assert.equal(snap.a[0].data?.requestsByAgent["bot-a/1.0"], 3);
    assert.equal(snap.a[0].error, undefined);
  } finally {
    restore();
  }
});

test("pollOnce grava error (data:null) quando o Gateway esta fora do ar", async () => {
  const restore = mockFetch(async () => {
    throw new Error("fetch failed: ECONNREFUSED");
  });

  try {
    const config = { port: 0, pollIntervalMs: 1000, historySize: 60, outpostsFilePath: "", gateways: [{ name: "down", metricsUrl: "http://gw-down/metrics" }] };
    const historyStore = new MetricsHistoryStore(config.historySize);

    await pollOnce(config, historyStore);

    const entry = historyStore.snapshot().down[0];
    assert.equal(entry.data, null);
    assert.match(entry.error ?? "", /ECONNREFUSED/);
  } finally {
    restore();
  }
});

test("MetricsHistoryStore descarta as amostras mais antigas ao exceder historySize", () => {
  const store = new MetricsHistoryStore(3);
  for (let i = 0; i < 5; i++) {
    store.record("a", { fetchedAt: `t${i}`, data: null, error: `sample-${i}` });
  }
  const entries = store.snapshot().a;
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => e.error),
    ["sample-2", "sample-3", "sample-4"]
  );
});

test("GET /api/metrics/history reflete o que foi gravado no historyStore", async () => {
  const { app, historyStore } = testApp({ gateways: [] });
  historyStore.record("gw", { fetchedAt: "2026-01-01T00:00:00.000Z", data: snapshotOf("bot/1.0") });

  const res = await request(app).get("/api/metrics/history");
  assert.equal(res.status, 200);
  assert.equal(res.body.gateways.gw.length, 1);
  assert.equal(res.body.gateways.gw[0].data.requestsByAgent["bot/1.0"], 3);
});

test("startHistoryPolling/stopHistoryPolling: poller real grava amostras e para quando pedido", async () => {
  let callCount = 0;
  const restore = mockFetch(async (url) => {
    callCount += 1;
    if (url === "http://gw-a/metrics") return { ok: true, json: async () => snapshotOf("bot-a/1.0") };
    throw new Error(`URL inesperada: ${url}`);
  });

  try {
    const { historyStore, startHistoryPolling, stopHistoryPolling } = testApp({
      gateways: [{ name: "a", metricsUrl: "http://gw-a/metrics" }],
      pollIntervalMs: 15,
    });

    startHistoryPolling();
    startHistoryPolling(); // idempotente — nao deve duplicar o interval
    await new Promise((resolve) => setTimeout(resolve, 60));
    stopHistoryPolling();

    const countAfterStop = historyStore.snapshot().a.length;
    assert.ok(countAfterStop >= 2, `esperava >=2 amostras, teve ${countAfterStop}`);

    await new Promise((resolve) => setTimeout(resolve, 60));
    const countAfterWait = historyStore.snapshot().a.length;
    assert.equal(countAfterWait, countAfterStop, "nao deveria crescer mais apos stopHistoryPolling()");
  } finally {
    restore();
  }
});
