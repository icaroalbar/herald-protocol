import { Router, type Request, type Response } from "express";
import express from "express";
import { OutpostStore } from "./outposts.js";
import { MetricsHistoryStore } from "./history.js";

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Rotas de gestão de Outposts (ICA-34): criar/listar/revogar identidades, e o endpoint
 * de recebimento de métricas empurradas pelo Gateway (push, autenticado pela chave).
 */
export function createOutpostRouter(store: OutpostStore, historyStore: MetricsHistoryStore): Router {
  const router = Router();

  router.post("/api/outposts", express.json({ limit: "16kb" }), async (req: Request, res: Response) => {
    const name = req.body?.name;
    if (name !== undefined && typeof name !== "string") {
      return res.status(400).json({ error: "invalid_name" });
    }
    const result = await store.create(name);
    res.status(201).json(result);
  });

  router.get("/api/outposts", (_req: Request, res: Response) => {
    res.json({ outposts: store.list() });
  });

  router.delete("/api/outposts/:id", async (req: Request, res: Response) => {
    const removed = await store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "not_found" });
    res.status(204).end();
  });

  // Endpoint de push: sem :id na URL de propósito — a chave é o único identificador que
  // o agent (Gateway) tem (.env só guarda HERALD_DASHBOARD_URL + HERALD_OUTPOST_KEY).
  router.post("/api/outposts/reports", express.json({ limit: "256kb" }), (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const outpost = store.findByKey(token);
    if (!outpost) return res.status(401).json({ error: "unauthorized" });

    if (typeof req.body?.snapshot !== "object" || req.body.snapshot === null) {
      return res.status(400).json({ error: "invalid_snapshot" });
    }

    const fetchedAt =
      typeof req.body.reportedAt === "string" && !Number.isNaN(Date.parse(req.body.reportedAt))
        ? req.body.reportedAt
        : new Date().toISOString();

    historyStore.record(`outpost:${outpost.id}`, { fetchedAt, data: req.body.snapshot });
    store.touchLastSeen(outpost.id);

    res.status(202).json({ ok: true });
  });

  return router;
}
