import { test } from "node:test";
import assert from "node:assert/strict";
import { PrometheusMetricsCollector } from "./index.js";

function agent(agentType: "assistant" | "crawler" | "autonomous" | "search-index" | "unknown"): Parameters<PrometheusMetricsCollector["incrementRequest"]>[0] {
  return { agentId: "test/1.0", agentType, verified: false, source: "herald-header" };
}

test("incrementRequest conta por agent_type no texto Prometheus", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.incrementRequest(agent("crawler"));
  collector.incrementRequest(agent("crawler"));
  collector.incrementRequest(agent("assistant"));

  const { body } = await collector.renderPrometheus();
  assert.match(body, /herald_requests_total\{agent_type="crawler"\} 2/);
  assert.match(body, /herald_requests_total\{agent_type="assistant"\} 1/);
});

test("recordPolicyDecision conta por result", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.recordPolicyDecision(agent("crawler"), { intent: "read", result: "allow", rule: "default" });
  collector.recordPolicyDecision(agent("crawler"), { intent: "read", result: "deny", rule: "default" });

  const { body } = await collector.renderPrometheus();
  assert.match(body, /herald_policy_decisions_total\{result="allow"\} 1/);
  assert.match(body, /herald_policy_decisions_total\{result="deny"\} 1/);
});

test("recordFormat conta por format", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.recordFormat(agent("assistant"), "structured-json");

  const { body } = await collector.renderPrometheus();
  assert.match(body, /herald_formats_served_total\{format="structured-json"\} 1/);
});

test("recordError conta por agent_type + status_code", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.recordError(agent("crawler"), 429);
  collector.recordError(agent("crawler"), 429);

  const { body } = await collector.renderPrometheus();
  assert.match(body, /herald_errors_total\{agent_type="crawler",status_code="429"\} 2/);
});

test("recordLatency alimenta o histograma herald_request_duration_ms", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.recordLatency(agent("crawler"), 42);

  const { body } = await collector.renderPrometheus();
  assert.match(body, /herald_request_duration_ms_count\{agent_type="crawler"\} 1/);
  assert.match(body, /herald_request_duration_ms_sum\{agent_type="crawler"\} 42/);
});

test("renderPrometheus não usa agentId como label (evita cardinalidade sem limite)", async () => {
  const collector = new PrometheusMetricsCollector();
  collector.incrementRequest({ agentId: "bot-a/1.0", agentType: "crawler", verified: false, source: "herald-header" });
  collector.incrementRequest({ agentId: "bot-b/2.0", agentType: "crawler", verified: false, source: "herald-header" });

  const { body } = await collector.renderPrometheus();
  assert.doesNotMatch(body, /bot-a/);
  assert.doesNotMatch(body, /bot-b/);
  assert.match(body, /herald_requests_total\{agent_type="crawler"\} 2/);
});

test("renderPrometheus retorna contentType no formato de texto Prometheus", async () => {
  const collector = new PrometheusMetricsCollector();
  const { contentType } = await collector.renderPrometheus();
  assert.match(contentType, /^text\/plain/);
});

test("duas instâncias com registries próprios não compartilham contadores", async () => {
  const a = new PrometheusMetricsCollector();
  const b = new PrometheusMetricsCollector();
  a.incrementRequest(agent("crawler"));

  const [bodyA, bodyB] = await Promise.all([a.renderPrometheus(), b.renderPrometheus()]);
  assert.match(bodyA.body, /herald_requests_total\{agent_type="crawler"\} 1/);
  assert.doesNotMatch(bodyB.body, /herald_requests_total\{agent_type="crawler"\}/);
});
