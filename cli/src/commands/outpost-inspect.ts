import { withDb } from "../db.js";
import { resolveOutpost } from "../outpost-id.js";

export interface OutpostDetail {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  /** false = pausado via "outpost stop" — push rejeitado (403) até "outpost start". */
  active: boolean;
  latestReport: { reportedAt: string; snapshot: unknown } | null;
}

export interface OutpostInspectOptions {
  databaseUrl: string;
}

export async function inspectOutpost(idPrefix: string, options: OutpostInspectOptions): Promise<OutpostDetail> {
  return withDb(options.databaseUrl, async ({ outposts, reports }) => {
    const outpost = await resolveOutpost(outposts, idPrefix);
    const latestReport = await reports.latest(outpost.id);
    return { ...outpost, latestReport };
  });
}
