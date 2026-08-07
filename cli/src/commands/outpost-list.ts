import { withDb } from "../db.js";

export interface OutpostSummary {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface OutpostListOptions {
  databaseUrl: string;
}

export async function listOutposts(options: OutpostListOptions): Promise<OutpostSummary[]> {
  return withDb(options.databaseUrl, ({ outposts }) => outposts.list());
}
