import { pgTable, text, varchar, integer, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Demons (bad habits)
export const demons = pgTable("demons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertDemonSchema = createInsertSchema(demons).omit({ id: true });
export type InsertDemon = z.infer<typeof insertDemonSchema>;
export type Demon = typeof demons.$inferSelect;

// Log entries (each time a demon is triggered)
export const logEntries = pgTable("log_entries", {
  id: serial("id").primaryKey(),
  demonId: integer("demon_id").notNull(),
  cost: real("cost").default(0),
  timestamp: text("timestamp").notNull(),
});

export const insertLogEntrySchema = createInsertSchema(logEntries).omit({ id: true });
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;
