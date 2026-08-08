import { withDb } from "../db.js";
import { resolveOutpost } from "../outpost-id.js";

export interface OutpostStopOptions {
  databaseUrl: string;
}

/** Pausa reversível (docker-style) — key continua existindo, push de métricas passa a
 * retornar 403 até "outpost start". Diferente de removeOutpost() (irreversível). */
export async function stopOutpost(idPrefix: string, options: OutpostStopOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const outpost = await resolveOutpost(outposts, idPrefix);
    await outposts.setActive(outpost.id, false);
  });
}
