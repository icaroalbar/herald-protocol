import type { Request } from "express";
import type { Capability } from "@heraldserver/sdk";

export type FormatterFn = (req: Request) => unknown | Promise<unknown>;

interface FormatterEntry {
  /** Glob simples: suporta apenas sufixo "*", ex: "/artigos/*". */
  pattern: string;
  format: Capability;
  fn: FormatterFn;
}

function matchesPattern(pattern: string, resource: string): boolean {
  if (pattern.endsWith("*")) return resource.startsWith(pattern.slice(0, -1));
  return pattern === resource;
}

/**
 * Registro de formatadores de conteúdo por recurso+formato (ARCHITECTURE.md §4.3).
 * A aplicação registra como transformar um recurso para um formato negociado; o Gateway
 * nunca tenta converter conteúdo HTML em JSON estruturado automaticamente — isso evitaria
 * violar o princípio de "conteúdo inalterado" do RFC-0001 §7.
 */
export class FormatterRegistry {
  private entries: FormatterEntry[] = [];

  register(pattern: string, format: Capability, fn: FormatterFn): void {
    this.entries.push({ pattern, format, fn });
  }

  resolve(resource: string, format: Capability): FormatterFn | null {
    const entry = this.entries.find((e) => e.format === format && matchesPattern(e.pattern, resource));
    return entry ? entry.fn : null;
  }
}
