#!/usr/bin/env node
/**
 * Teste de carga para FixedWindowRateLimiter e InMemoryMetricsCollector (ICA-30).
 *
 * Como as duas estruturas são in-memory e o custo é puramente computacional (sem I/O),
 * o teste não espera tempo real de parede — simula volume alto via chamadas diretas e
 * mede o heap antes/depois de cada fase. Rodar com --expose-gc para números confiáveis
 * (força coleta de lixo antes de cada medição).
 *
 * Uso: node --expose-gc scripts/load-test.mjs [AGENTS] [REQUESTS_PER_AGENT_PHASE2]
 */

import { FixedWindowRateLimiter } from "../dist/rate-limiter.js";
import { InMemoryMetricsCollector } from "@herald/sdk";

const AGENTS = Number(process.argv[2] ?? 10_000);
const SINGLE_AGENT_REQUESTS = Number(process.argv[3] ?? 1_000_000);

function heapMB() {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function fmt(mb) {
  return `${mb.toFixed(2)} MB`;
}

console.log(`Node ${process.version} | --expose-gc: ${global.gc ? "sim" : "NAO (rode com --expose-gc)"}\n`);

const limiter = new FixedWindowRateLimiter();
const metrics = new InMemoryMetricsCollector();
const rateLimit = { requests: 100, windowSeconds: 60 };

// --- Fase 1: N agentes distintos, 1 requisição cada ---
// Testa crescimento do Map interno do rate limiter e de requestsByAgent/errorsByAgent
// do metrics collector em função da CARDINALIDADE de agentes distintos.
const before1 = heapMB();
for (let i = 0; i < AGENTS; i++) {
  const agent = { agentId: `agent-${i}`, agentType: "assistant", source: "declared" };
  limiter.check(agent.agentId, rateLimit);
  metrics.incrementRequest(agent);
  metrics.recordError(agent, 429);
  metrics.recordFormat(agent, "structured-json");
  metrics.recordPolicyDecision(agent, { intent: "read", result: "allow" });
}
const after1 = heapMB();
console.log(`Fase 1 — ${AGENTS.toLocaleString("pt-BR")} agentes distintos, 1 req cada`);
console.log(`  heap antes: ${fmt(before1)} | depois: ${fmt(after1)} | delta: ${fmt(after1 - before1)}`);
console.log(`  bytes/agente (rate limiter + metrics combinados): ${(((after1 - before1) * 1024 * 1024) / AGENTS).toFixed(1)} B\n`);

// --- Fase 2: 1 agente único, muitas requisições ---
// Testa o array `latencies` do metrics collector, que é empurrado a cada
// recordLatency() sem nenhum limite — cresce por REQUISIÇÃO, não por agente distinto.
const singleAgent = { agentId: "agent-fixo", agentType: "assistant", source: "declared" };
const before2 = heapMB();
for (let i = 0; i < SINGLE_AGENT_REQUESTS; i++) {
  limiter.check(singleAgent.agentId, rateLimit);
  metrics.incrementRequest(singleAgent);
  metrics.recordLatency(singleAgent, 10 + (i % 50));
}
const after2 = heapMB();
console.log(`Fase 2 — 1 agente fixo, ${SINGLE_AGENT_REQUESTS.toLocaleString("pt-BR")} requisições`);
console.log(`  heap antes: ${fmt(before2)} | depois: ${fmt(after2)} | delta: ${fmt(after2 - before2)}`);
console.log(`  bytes/requisição: ${(((after2 - before2) * 1024 * 1024) / SINGLE_AGENT_REQUESTS).toFixed(2)} B`);
console.log(`  snapshot.sampleCount: ${metrics.snapshot().sampleCount.toLocaleString("pt-BR")} (== requisições da fase 2, array nunca truncado)\n`);

console.log("Conclusão:");
console.log("  - Fase 1 confirma crescimento do Map do rate limiter e dos objetos do metrics");
console.log("    collector proporcional à CARDINALIDADE de agentes distintos — sem eviction/TTL,");
console.log("    um agente que some não libera memória, mas o crescimento é limitado pelo número");
console.log("    de agentes únicos já vistos (tipicamente muito menor que o volume de requisições).");
console.log("  - Fase 2 confirma que `InMemoryMetricsCollector.latencies` cresce SEM LIMITE, um");
console.log("    elemento por requisição, independente de quantos agentes distintos existem — em");
console.log("    produção sob volume sustentado isso é crescimento de memória ilimitado real.");
console.log("    Ver issue de follow-up.");
