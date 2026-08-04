import type { Request } from "express";
import type { AgentContext, Capability } from "@herald/sdk";

export interface HeraldRequestContext {
  agent: AgentContext;
  format: Capability;
  /** true quando houve interseção real de capacidades; false quando caiu no fallback. */
  matched: boolean;
}

const HERALD_CONTEXT_KEY = "__herald__";

/** Uso interno do Gateway — anexa o contexto Herald resolvido à requisição. */
export function setHeraldContext(req: Request, ctx: HeraldRequestContext): void {
  (req as unknown as Record<string, unknown>)[HERALD_CONTEXT_KEY] = ctx;
}

/**
 * Lê o contexto Herald resolvido pelo Gateway (agente identificado, formato negociado).
 * Use dentro de handlers downstream para saber em qual formato renderizar a resposta.
 */
export function getHeraldContext(req: Request): HeraldRequestContext | undefined {
  return (req as unknown as Record<string, unknown>)[HERALD_CONTEXT_KEY] as HeraldRequestContext | undefined;
}
