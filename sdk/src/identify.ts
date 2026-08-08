import type { AgentContext, AgentType } from "./types.js";

const AGENT_ID_PATTERN = /^[a-z0-9_]+-[a-z0-9_-]+\/[0-9.]+$/;

const AGENT_TYPES: AgentType[] = ["assistant", "crawler", "autonomous", "search-index"];

export interface KnownPattern {
  pattern: RegExp;
  agentId: string;
  agentType: AgentType;
}

/** Padrões conhecidos de User-Agent para fallback de identificação (RFC-0001 §4.3). */
export const KNOWN_USER_AGENT_PATTERNS: KnownPattern[] = [
  { pattern: /GPTBot/i, agentId: "openai-gptbot/unknown", agentType: "crawler" },
  { pattern: /ChatGPT-User/i, agentId: "openai-chatgpt-user/unknown", agentType: "assistant" },
  { pattern: /ClaudeBot/i, agentId: "anthropic-claudebot/unknown", agentType: "crawler" },
  { pattern: /Claude-User/i, agentId: "anthropic-claude-user/unknown", agentType: "assistant" },
  { pattern: /PerplexityBot/i, agentId: "perplexity-bot/unknown", agentType: "crawler" },
  { pattern: /CCBot/i, agentId: "commoncrawl-ccbot/unknown", agentType: "crawler" },
  { pattern: /Google-Extended/i, agentId: "google-extended/unknown", agentType: "crawler" },
  { pattern: /Bytespider/i, agentId: "bytedance-bytespider/unknown", agentType: "crawler" },
];

export interface IdentifyOptions {
  /** Headers da requisição. Chaves em qualquer capitalização são aceitas. */
  headers: Record<string, string | string[] | undefined>;
  /** Estende a lista padrão de padrões conhecidos de User-Agent. */
  extraPatterns?: KnownPattern[];
}

function header(headers: IdentifyOptions["headers"], name: string): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

function isValidAgentType(value: string | undefined): value is AgentType {
  return !!value && (AGENT_TYPES as string[]).includes(value);
}

/**
 * Identifica um agente a partir dos headers da requisição, conforme RFC-0001 §4.
 * Prioriza Herald-Agent-Id/Herald-Agent-Type; usa User-Agent como fallback não verificado.
 *
 * Sempre retorna verified=false — identificação (síncrona, barata, baseada em padrões)
 * é deliberadamente separada de verificação criptográfica (assíncrona, potencialmente
 * com I/O para resolver chaves). Para popular verified=true, use
 * `verifyRequestSignature()` de `./signature.js` e atualize o campo no AgentContext
 * retornado (ver ICA-27 / revisão da Fase 1, e README do @heraldserver/gateway para o fluxo
 * completo já integrado no pipeline do Gateway).
 */
export function identifyAgent(options: IdentifyOptions): AgentContext {
  const { headers, extraPatterns = [] } = options;

  const heraldAgentId = header(headers, "Herald-Agent-Id");
  const heraldAgentType = header(headers, "Herald-Agent-Type");

  if (heraldAgentId && AGENT_ID_PATTERN.test(heraldAgentId)) {
    return {
      agentId: heraldAgentId,
      agentType: isValidAgentType(heraldAgentType) ? heraldAgentType : "unknown",
      verified: false,
      source: "herald-header",
    };
  }

  const userAgent = header(headers, "User-Agent") ?? "";
  const allPatterns = [...KNOWN_USER_AGENT_PATTERNS, ...extraPatterns];
  for (const { pattern, agentId, agentType } of allPatterns) {
    if (pattern.test(userAgent)) {
      return { agentId, agentType, verified: false, source: "user-agent-fallback" };
    }
  }

  return { agentId: null, agentType: "unknown", verified: false, source: "none" };
}

/** true quando a requisição não foi identificada como agente (provável navegador humano). */
export function isHumanBrowser(context: AgentContext): boolean {
  return context.source === "none";
}
