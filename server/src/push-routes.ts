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
 * Única rota HTTP deste pacote — o resto (criar/listar/revogar/inspecionar Outpost) virou
 * operação direta de PgOutpostStore/PgReportsStore, chamada pelo @herald/cli sem passar
 * por HTTP. Essa rota continua existindo porque quem empurra métricas é o Gateway/app
 * monitorada, que não deve ter credencial de Postgres — só a Outpost key, via Bearer.
 */
export function createPushRouter(store: PgOutpostStore, reportsStore: PgReportsStore): Router {
  const router = Router();

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

    await reportsStore.record(outpostId, reportedAt, req.body.snapshot);
    void store.touchLastSeen(outpostId).catch(() => {});

    res.status(202).json({ ok: true });
  });

  return router;
}
