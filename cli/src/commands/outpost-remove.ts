import { withDb } from "../db.js";

export interface OutpostRemoveOptions {
  databaseUrl: string;
}

export async function removeOutpost(id: string, options: OutpostRemoveOptions): Promise<void> {
  await withDb(options.databaseUrl, async ({ outposts }) => {
    const removed = await outposts.remove(id);
    if (!removed) {
      throw new Error(`Outpost ${id} não encontrado`);
    }
  });
}
