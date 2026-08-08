/**
 * Schema idempotente (CREATE TABLE/INDEX IF NOT EXISTS), sem framework de migração —
 * mesma filosofia de dependência mínima do resto do projeto (2 tabelas, 4-5 queries não
 * justificam uma ferramenta de migração dedicada). Rodado a cada startup do processo via
 * db.ts#migrate().
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS outposts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT true
);

-- CREATE TABLE IF NOT EXISTS não adiciona coluna em tabela já existente — ALTER ... IF
-- NOT EXISTS cobre quem já rodou o schema antes da coluna "active" existir (idempotente
-- igual o resto, sem framework de migração).
ALTER TABLE outposts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS outpost_reports (
  id            BIGSERIAL PRIMARY KEY,
  outpost_id    TEXT NOT NULL REFERENCES outposts(id) ON DELETE CASCADE,
  reported_at   TIMESTAMPTZ NOT NULL,
  snapshot      JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outpost_reports_outpost_id_reported_at
  ON outpost_reports (outpost_id, reported_at DESC);
`;
