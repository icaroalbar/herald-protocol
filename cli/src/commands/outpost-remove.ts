import { withDb } from "../db.js";
import { resolveOutpost } from "../outpost-id.js";

export interface OutpostRemoveOptions {
  databaseUrl: string;
}

export async function removeOutpost(idPrefix: string, options: OutpostRemoveOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const outpost = await resolveOutpost(outposts, idPrefix);
    await outposts.remove(outpost.id);
  });
}
