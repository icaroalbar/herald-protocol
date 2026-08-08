import { withDb } from "../db.js";

export interface OutpostSummary {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  /** false = pausado via "outpost stop" — push rejeitado (403) até "outpost start". */
  active: boolean;
  /** Requests sem identificação Herald (source="none" no SDK, provável navegador
   * humano) — bucket "unknown:unknown" de requestsByAgent no snapshot mais recente. */
  humanRequests: number;
  /** Soma de todos os outros buckets de requestsByAgent (qualquer agente identificado,
   * via header Herald-Agent-Id ou fallback de User-Agent). */
  agentRequests: number;
}

export interface OutpostListOptions {
  databaseUrl: string;
}

/** requestsByAgent é keyed por agentId (ou "unknown:unknown" quando não identificado —
 * ver InMemoryMetricsCollector#key em sdk/src/metrics.ts) — não confiamos na forma exata
 * do snapshot além de checar que é objeto, já que ele atravessa Postgres como JSONB cru. */
function splitTraffic(snapshot: unknown): { human: number; agent: number } {
  const requestsByAgent = (snapshot as { requestsByAgent?: unknown } | null)?.requestsByAgent;
  let human = 0;
  let agent = 0;
  if (requestsByAgent && typeof requestsByAgent === "object") {
    for (const [key, value] of Object.entries(requestsByAgent as Record<string, unknown>)) {
      const count = typeof value === "number" ? value : 0;
      if (key === "unknown:unknown") human += count;
      else agent += count;
    }
  }
  return { human, agent };
}

export async function listOutposts(options: OutpostListOptions): Promise<OutpostSummary[]> {
  return withDb(options.databaseUrl, async ({ outposts, reports }) => {
    const list = await outposts.list();
    return Promise.all(
      list.map(async (o) => {
        const latest = await reports.latest(o.id);
        const { human, agent } = splitTraffic(latest?.snapshot);
        return {
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
          lastSeenAt: o.lastSeenAt,
          active: o.active,
          humanRequests: human,
          agentRequests: agent,
        };
      })
    );
  });
}
