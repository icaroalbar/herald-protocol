import type pg from "pg";

export interface ReportRecord {
  reportedAt: string;
  snapshot: unknown;
}

interface ReportRow {
  reported_at: Date;
  snapshot: unknown;
}

export class PgReportsStore {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * `pg` não serializa objeto JS pra `jsonb` sozinho — JSON.stringify + cast `::jsonb`
   * são obrigatórios aqui, não estilo opcional (passar o objeto cru pro parâmetro sem
   * isso lança ou grava algo errado, dependendo da versão do driver).
   */
  async record(outpostId: string, reportedAt: string, snapshot: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO outpost_reports (outpost_id, reported_at, snapshot) VALUES ($1, $2, $3::jsonb)`,
      [outpostId, reportedAt, JSON.stringify(snapshot)]
    );
  }

  async latest(outpostId: string): Promise<ReportRecord | null> {
    const { rows } = await this.pool.query<ReportRow>(
      `SELECT reported_at, snapshot FROM outpost_reports
       WHERE outpost_id = $1 ORDER BY reported_at DESC LIMIT 1`,
      [outpostId]
    );
    if (!rows.length) return null;
    return { reportedAt: rows[0].reported_at.toISOString(), snapshot: rows[0].snapshot };
  }
}
