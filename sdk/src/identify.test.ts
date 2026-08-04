import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyAgent, isHumanBrowser } from "./identify.js";

test("identifica agente via Herald-Agent-Id + Herald-Agent-Type validos", () => {
  const agent = identifyAgent({
    headers: { "Herald-Agent-Id": "anthropic-claude/1.0", "Herald-Agent-Type": "assistant" },
  });
  assert.equal(agent.agentId, "anthropic-claude/1.0");
  assert.equal(agent.agentType, "assistant");
  assert.equal(agent.verified, false);
  assert.equal(agent.source, "herald-header");
});

test("agentType vira 'unknown' quando Herald-Agent-Type esta ausente ou invalido", () => {
  const agent = identifyAgent({ headers: { "Herald-Agent-Id": "anthropic-claude/1.0" } });
  assert.equal(agent.agentType, "unknown");
  assert.equal(agent.source, "herald-header");

  const agent2 = identifyAgent({
    headers: { "Herald-Agent-Id": "anthropic-claude/1.0", "Herald-Agent-Type": "not-a-real-type" },
  });
  assert.equal(agent2.agentType, "unknown");
});

test("Herald-Agent-Id malformado cai para fallback de User-Agent", () => {
  const agent = identifyAgent({
    headers: { "Herald-Agent-Id": "isso nao bate com a gramatica!!", "User-Agent": "Mozilla/5.0 ClaudeBot/1.0" },
  });
  assert.equal(agent.source, "user-agent-fallback");
  assert.equal(agent.agentType, "crawler");
});

test("detecta padroes conhecidos de User-Agent (fallback nao verificado)", () => {
  const cases: Array<[string, string]> = [
    ["Mozilla/5.0 (compatible; GPTBot/1.0)", "crawler"],
    ["Mozilla/5.0 (compatible; ClaudeBot/1.0)", "crawler"],
    ["Mozilla/5.0 (compatible; PerplexityBot/1.0)", "crawler"],
    ["Mozilla/5.0 (compatible; CCBot/2.0)", "crawler"],
  ];
  for (const [ua, expectedType] of cases) {
    const agent = identifyAgent({ headers: { "User-Agent": ua } });
    assert.equal(agent.source, "user-agent-fallback", `esperado fallback para "${ua}"`);
    assert.equal(agent.agentType, expectedType);
    assert.equal(agent.verified, false);
  }
});

test("sem nenhuma identificacao -> source none, agentId null", () => {
  const agent = identifyAgent({ headers: { "User-Agent": "Mozilla/5.0 (Macintosh)" } });
  assert.equal(agent.source, "none");
  assert.equal(agent.agentId, null);
  assert.equal(agent.agentType, "unknown");
  assert.equal(agent.verified, false);
});

test("extraPatterns estende a deteccao de User-Agent", () => {
  const agent = identifyAgent({
    headers: { "User-Agent": "MeuBotCustomizado/1.0" },
    extraPatterns: [{ pattern: /MeuBotCustomizado/, agentId: "acme-meubot/1.0", agentType: "crawler" }],
  });
  assert.equal(agent.source, "user-agent-fallback");
  assert.equal(agent.agentId, "acme-meubot/1.0");
});

test("lookup de header e case-insensitive", () => {
  const agent = identifyAgent({
    headers: { "herald-agent-id": "anthropic-claude/1.0", "herald-agent-type": "assistant" },
  });
  assert.equal(agent.agentId, "anthropic-claude/1.0");
  assert.equal(agent.source, "herald-header");
});

test("isHumanBrowser so retorna true para source 'none'", () => {
  assert.equal(isHumanBrowser({ agentId: null, agentType: "unknown", verified: false, source: "none" }), true);
  assert.equal(
    isHumanBrowser({ agentId: "x/1.0", agentType: "assistant", verified: false, source: "herald-header" }),
    false
  );
  assert.equal(
    isHumanBrowser({ agentId: "x/1.0", agentType: "crawler", verified: false, source: "user-agent-fallback" }),
    false
  );
});
