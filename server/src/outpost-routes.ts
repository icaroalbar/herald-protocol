import { Router, type Request, type Response } from "express";
import express from "express";
import { PgOutpostStore } from "./outposts.js";
import { PgReportsStore } from "./reports.js";

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Mesmo contrato HTTP de dashboard/src/outpost-routes.ts (ICA-34), portado pra Postgres —
 * sdk/src/reporting.ts e cli/src/commands/outpost-create.ts não precisam mudar nada além
 * do rename de dashboardUrl->serverUrl. Único endpoint novo: GET /api/outposts/:id.
 */
export function createOutpostRouter(store: PgOutpostStore, reportsStore: PgReportsStore): Router {
  const router = Router();

  router.post("/api/outposts", express.json({ limit: "16kb" }), async (req: Request, res: Response) => {
    const name = req.body?.name;
    if (name !== undefined && typeof name !== "string") {
      return res.status(400).json({ error: "invalid_name" });
    }
    const result = await store.create(name);
    res.status(201).json(result);
  });

  router.get("/api/outposts", async (_req: Request, res: Response) => {
    res.json({ outposts: await store.list() });
  });

  // Novo: não existe nem como conceito no dashboard (só tinha /api/metrics/history
  // agregado). Necessário pro `herald outpost inspect`.
  router.get("/api/outposts/:id", async (req: Request, res: Response) => {
    const outpost = await store.get(req.params.id);
    if (!outpost) return res.status(404).json({ error: "not_found" });
    const latestReport = await reportsStore.latest(outpost.id);
    res.json({ ...outpost, latestReport });
  });

  router.delete("/api/outposts/:id", async (req: Request, res: Response) => {
    const removed = await store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "not_found" });
    res.status(204).end();
  });

  // Sem :id na URL de propósito — a chave é o único identificador que o Gateway tem
  // (.env só guarda HERALD_SERVER_URL + HERALD_OUTPOST_KEY).
  router.post("/api/outposts/reports", express.json({ limit: "256kb" }), async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const outpostId = await store.findIdByKey(token);
    if (!outpostId) return res.status(401).json({ error: "unauthorized" });

    if (typeof req.body?.snapshot !== "object" || req.body.snapshot === null) {
      return res.status(400).json({ error: "invalid_snapshot" });
    }

    const reportedAt =
      typeof req.body.reportedAt === "string" && !Number.isNaN(Date.parse(req.body.reportedAt))
        ? req.body.reportedAt
        : new Date().toISOString();

    // Diferente da versão em memória (nunca falhava): aqui o insert pode falhar de
    // verdade (FK, conexão caiu) — dá await pra reportar erro real em vez de perder o
    // dado silenciosamente. touchLastSeen continua fire-and-forget.
    await reportsStore.record(outpostId, reportedAt, req.body.snapshot);
    void store.touchLastSeen(outpostId).catch(() => {});

    res.status(202).json({ ok: true });
  });

  return router;
}
