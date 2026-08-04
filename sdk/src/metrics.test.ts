import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryMetricsCollector } from "./metrics.js";
import type { AgentContext } from "./types.js";

function agent(agentId: string | null, agentType: AgentContext["agentType"] = "assistant"): AgentContext {
  return { agentId, agentType, verified: false, source: agentId ? "herald-header" : "none" };
}

test("incrementRequest conta por agentId", () => {
  const metrics = new InMemoryMetricsCollector();
  metrics.incrementRequest(agent("a/1.0"));
  metrics.incrementRequest(agent("a/1.0"));
  metrics.incrementRequest(agent("b/1.0"));

  const snap = metrics.snapshot();
  assert.equal(snap.requestsByAgent["a/1.0"], 2);
  assert.equal(snap.requestsByAgent["b/1.0"], 1);
});

test("agente sem agentId usa chave 'unknown:<agentType>'", () => {
  const metrics = new InMemoryMetricsCollector();
  metrics.incrementRequest(agent(null, "crawler"));
  const snap = metrics.snapshot();
  assert.equal(snap.requestsByAgent["unknown:crawler"], 1);
});

test("recordLatency calcula a media corretamente", () => {
  const metrics = new InMemoryMetricsCollector();
  const a = agent("a/1.0");
  metrics.recordLatency(a, 10);
  metrics.recordLatency(a, 20);
  metrics.recordLatency(a, 30);
  const snap = metrics.snapshot();
  assert.equal(snap.averageLatencyMs, 20);
  assert.equal(snap.sampleCount, 3);
});

test("recordError agrupa por agentId:statusCode", () => {
  const metrics = new InMemoryMetricsCollector();
  const a = agent("a/1.0");
  metrics.recordError(a, 403);
  metrics.recordError(a, 403);
  metrics.recordError(a, 429);
  const snap = metrics.snapshot();
  assert.equal(snap.errorsByAgent["a/1.0:403"], 2);
  assert.equal(snap.errorsByAgent["a/1.0:429"], 1);
});

test("recordPolicyDecision e recordFormat contam por resultado/formato", () => {
  const metrics = new InMemoryMetricsCollector();
  const a = agent("a/1.0");
  metrics.recordPolicyDecision(a, { intent: "read", result: "allow", rule: "default" });
  metrics.recordPolicyDecision(a, { intent: "read", result: "allow", rule: "default" });
  metrics.recordPolicyDecision(a, { intent: "read", result: "deny", rule: "default" });
  metrics.recordFormat(a, "structured-json");

  const snap = metrics.snapshot();
  assert.equal(snap.decisionsByResult.allow, 2);
  assert.equal(snap.decisionsByResult.deny, 1);
  assert.equal(snap.formatsServed["structured-json"], 1);
});

test("snapshot sem amostras retorna averageLatencyMs 0", () => {
  const metrics = new InMemoryMetricsCollector();
  const snap = metrics.snapshot();
  assert.equal(snap.averageLatencyMs, 0);
  assert.equal(snap.sampleCount, 0);
});
