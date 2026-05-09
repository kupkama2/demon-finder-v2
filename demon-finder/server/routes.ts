import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDemonSchema, insertLogEntrySchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Demons ===
  app.get("/api/demons", async (_req, res) => {
    const demons = await storage.getDemons();
    res.json(demons);
  });

  app.post("/api/demons", async (req, res) => {
    const parsed = insertDemonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const demon = await storage.createDemon(parsed.data);
    res.status(201).json(demon);
  });

  app.patch("/api/demons/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const updated = await storage.updateDemon(id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/demons/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteDemon(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  });

  // === Log Entries ===
  app.get("/api/logs", async (_req, res) => {
    const entries = await storage.getLogEntries();
    res.json(entries);
  });

  app.get("/api/logs/demon/:demonId", async (req, res) => {
    const demonId = parseInt(req.params.demonId);
    if (isNaN(demonId)) return res.status(400).json({ error: "Invalid id" });
    const entries = await storage.getLogEntriesByDemon(demonId);
    res.json(entries);
  });

  app.post("/api/logs", async (req, res) => {
    const parsed = insertLogEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const entry = await storage.createLogEntry(parsed.data);
    res.status(201).json(entry);
  });

  app.delete("/api/logs/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteLogEntry(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  });

  app.delete("/api/logs", async (_req, res) => {
    await storage.clearAllLogEntries();
    res.status(204).send();
  });

  return httpServer;
}
