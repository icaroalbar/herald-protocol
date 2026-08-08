import { withDb } from "../db.js";
import { resolveOutpost } from "../outpost-id.js";

export interface OutpostPruneOptions {
  databaseUrl: string;
  /** Reports com reported_at anterior a essa quantidade de dias são apagados. Sem
   * default de propósito — força o operador a escolher a janela explicitamente, mesmo
   * espírito de "rm"/"prune" do docker: ação destrutiva não tem valor mágico silencioso. */
  olderThanDays: number;
}

export interface OutpostPruneResult {
  deleted: number;
}

/** Apaga reports antigos (manual, sem cron — ver server/README.md). idPrefix opcional
 * escopa a poda a um Outpost só; sem ele, poda de todos. */
export async function pruneReports(idPrefix: string | undefined, options: OutpostPruneOptions): Promise<OutpostPruneResult> {
  return withDb(options.databaseUrl, async ({ outposts, reports }) => {
    const outpostId = idPrefix ? (await resolveOutpost(outposts, idPrefix)).id : undefined;
    const cutoff = new Date(Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await reports.pruneOlderThan(cutoff, outpostId);
    return { deleted };
  });
}
