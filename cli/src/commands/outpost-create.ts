import { withDb } from "../db.js";

export interface OutpostCreateOptions {
  databaseUrl: string;
  name?: string;
}

export interface OutpostCreateResult {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export async function createOutpost(options: OutpostCreateOptions): Promise<OutpostCreateResult> {
  return withDb(options.databaseUrl, ({ outposts }) => outposts.create(options.name));
}
