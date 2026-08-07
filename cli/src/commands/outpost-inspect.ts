import { withDb } from "../db.js";

export interface OutpostDetail {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  latestReport: { reportedAt: string; snapshot: unknown } | null;
}

export interface OutpostInspectOptions {
  databaseUrl: string;
}

export async function inspectOutpost(id: string, options: OutpostInspectOptions): Promise<OutpostDetail> {
  return withDb(options.databaseUrl, async ({ outposts, reports }) => {
    const outpost = await outposts.get(id);
    if (!outpost) {
      throw new Error(`Outpost ${id} não encontrado`);
    }
    const latestReport = await reports.latest(id);
    return { ...outpost, latestReport };
  });
}
