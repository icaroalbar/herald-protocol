import { withDb } from "../db.js";
import { resolveOutpost } from "../outpost-id.js";

export interface OutpostStartOptions {
  databaseUrl: string;
}

/** Retoma um Outpost pausado por "outpost stop" — push de métricas volta a ser aceito. */
export async function startOutpost(idPrefix: string, options: OutpostStartOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const outpost = await resolveOutpost(outposts, idPrefix);
    await outposts.setActive(outpost.id, true);
  });
}
