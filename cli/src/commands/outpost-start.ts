import { withDb } from "../db.js";

export interface OutpostStartOptions {
  databaseUrl: string;
}

/** Retoma um Outpost pausado por "outpost stop" — push de métricas volta a ser aceito. */
export async function startOutpost(id: string, options: OutpostStartOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const ok = await outposts.setActive(id, true);
    if (!ok) {
      throw new Error(`Outpost ${id} não encontrado`);
    }
  });
}
