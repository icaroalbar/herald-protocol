import { withDb } from "../db.js";

export interface OutpostStopOptions {
  databaseUrl: string;
}

/** Pausa reversível (docker-style) — key continua existindo, push de métricas passa a
 * retornar 403 até "outpost start". Diferente de removeOutpost() (irreversível). */
export async function stopOutpost(id: string, options: OutpostStopOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const ok = await outposts.setActive(id, false);
    if (!ok) {
      throw new Error(`Outpost ${id} não encontrado`);
    }
  });
}
