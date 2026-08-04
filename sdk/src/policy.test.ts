import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyEngine, formatPolicyDecisionHeader } from "./policy.js";
import type { AgentContext } from "./types.js";

function agent(overrides: Partial<AgentContext> = {}): AgentContext {
  return { agentId: "anthropic-claude/1.0", agentType: "assistant", verified: false, source: "herald-header", ...overrides };
}

test("precedencia: recurso vence sobre agent-type", () => {
  const engine = new PolicyEngine({
    default: { read: "allow" },
    byAgentType: { assistant: { read: "deny" } },
    byResource: [{ pattern: "/artigos/x", policies: { read: "allow" } }],
  });
  const decision = engine.evaluate({ agent: agent(), resource: "/artigos/x", intent: "read" });
  assert.equal(decision.result, "allow");
  assert.equal(decision.rule, "resource./artigos/x");
});

test("precedencia: agent-id vence sobre agent-type", () => {
  const engine = new PolicyEngine({
    default: { read: "allow" },
    byAgentType: { assistant: { read: "deny" } },
    byAgentId: { "anthropic-claude/1.0": { read: "allow" } },
  });
  const decision = engine.evaluate({ agent: agent(), resource: "/x", intent: "read" });
  assert.equal(decision.result, "allow");
  assert.equal(decision.rule, "by_agent_id.anthropic-claude/1.0");
});

test("fallback para default quando nada mais especifico define o intent", () => {
  const engine = new PolicyEngine({ default: { read: "allow" } });
  const decision = engine.evaluate({ agent: agent(), resource: "/x", intent: "read" });
  assert.equal(decision.result, "allow");
  assert.equal(decision.rule, "default");
});

test("intent nao definido em nenhuma regra -> not-applicable", () => {
  const engine = new PolicyEngine({ default: { read: "allow" } });
  const decision = engine.evaluate({ agent: agent(), resource: "/x", intent: "monetize" });
  assert.equal(decision.result, "not-applicable");
});

test("unverifiedOverride vence quando agente identificado e nao verificado", () => {
  const engine = new PolicyEngine({
    default: { train: "allow" },
    byAgentType: { crawler: { train: "ask" } },
    unverifiedOverride: { train: "deny" },
  });
  const decision = engine.evaluate({
    agent: agent({ agentType: "crawler", verified: false }),
    resource: "/x",
    intent: "train",
  });
  assert.equal(decision.result, "deny");
  assert.equal(decision.rule, "unverified_override.by_agent_type.crawler");
});

test("unverifiedOverride nao se aplica a agentes verificados", () => {
  const engine = new PolicyEngine({
    default: { train: "allow" },
    byAgentType: { crawler: { train: "ask" } },
    unverifiedOverride: { train: "deny" },
  });
  const decision = engine.evaluate({
    agent: agent({ agentType: "crawler", verified: true }),
    resource: "/x",
    intent: "train",
  });
  assert.equal(decision.result, "ask");
  assert.equal(decision.rule, "by_agent_type.crawler");
});

test("unverifiedOverride nao se aplica a humanos (source none)", () => {
  const engine = new PolicyEngine({
    default: { train: "allow" },
    unverifiedOverride: { train: "deny" },
  });
  const decision = engine.evaluate({
    agent: agent({ source: "none", agentId: null, agentType: "unknown" }),
    resource: "/x",
    intent: "train",
  });
  assert.equal(decision.result, "allow");
  assert.equal(decision.rule, "default");
});

test("glob de recurso com sufixo * casa por prefixo", () => {
  const engine = new PolicyEngine({
    default: { read: "deny" },
    byResource: [{ pattern: "/artigos/*", policies: { read: "allow" } }],
  });
  const decision = engine.evaluate({ agent: agent(), resource: "/artigos/premium/x", intent: "read" });
  assert.equal(decision.result, "allow");

  const decisionOutside = engine.evaluate({ agent: agent(), resource: "/outra-coisa", intent: "read" });
  assert.equal(decisionOutside.result, "deny");
});

test("rateLimit da regra resolvida e propagado na decisao", () => {
  const engine = new PolicyEngine({
    default: { read: "allow" },
    byAgentType: { crawler: { read: "allow", rateLimit: { requests: 5, windowSeconds: 60 } } },
  });
  const decision = engine.evaluate({ agent: agent({ agentType: "crawler" }), resource: "/x", intent: "read" });
  assert.deepEqual(decision.rateLimit, { requests: 5, windowSeconds: 60 });
});

test("formatPolicyDecisionHeader formata conforme RFC-0001 §8.4", () => {
  const header = formatPolicyDecisionHeader({ intent: "read", result: "allow", rule: "default" });
  assert.equal(header, "intent=read; result=allow; rule=default");
});
