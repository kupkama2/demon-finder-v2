import { type Demon, type InsertDemon, type LogEntry, type InsertLogEntry } from "@shared/schema";

export interface IStorage {
  // Demons
  getDemons(): Promise<Demon[]>;
  getDemon(id: number): Promise<Demon | undefined>;
  createDemon(demon: InsertDemon): Promise<Demon>;
  updateDemon(id: number, data: Partial<InsertDemon>): Promise<Demon | undefined>;
  deleteDemon(id: number): Promise<boolean>;

  // Log entries
  getLogEntries(): Promise<LogEntry[]>;
  getLogEntriesByDemon(demonId: number): Promise<LogEntry[]>;
  createLogEntry(entry: InsertLogEntry): Promise<LogEntry>;
  deleteLogEntry(id: number): Promise<boolean>;
  clearAllLogEntries(): Promise<void>;
}

export class MemStorage implements IStorage {
  private demons: Map<number, Demon>;
  private logEntries: Map<number, LogEntry>;
  private nextDemonId: number;
  private nextLogId: number;

  constructor() {
    this.demons = new Map();
    this.logEntries = new Map();
    this.nextDemonId = 1;
    this.nextLogId = 1;

    // Seed default demons from the Demon Finder screenshot
    const defaultDemons = [
      "Poor Risk/Reward Trade",
      "Entered Too Soon",
      "Entered Too Late",
      "Exited Too Soon",
      "Exited Too Late",
      "Trade Not In Trading Plan",
      "Incorrect Stop Placement",
      "Wrong Position Size",
      "Didn't Take Planned Trade",
    ];

    defaultDemons.forEach((name, index) => {
      const id = this.nextDemonId++;
      this.demons.set(id, { id, name, sortOrder: index });
    });
  }

  // Demons
  async getDemons(): Promise<Demon[]> {
    return Array.from(this.demons.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getDemon(id: number): Promise<Demon | undefined> {
    return this.demons.get(id);
  }

  async createDemon(demon: InsertDemon): Promise<Demon> {
    const id = this.nextDemonId++;
    const maxOrder = Math.max(0, ...Array.from(this.demons.values()).map(d => d.sortOrder));
    const newDemon: Demon = { id, name: demon.name, sortOrder: demon.sortOrder ?? maxOrder + 1 };
    this.demons.set(id, newDemon);
    return newDemon;
  }

  async updateDemon(id: number, data: Partial<InsertDemon>): Promise<Demon | undefined> {
    const demon = this.demons.get(id);
    if (!demon) return undefined;
    const updated = { ...demon, ...data };
    this.demons.set(id, updated);
    return updated;
  }

  async deleteDemon(id: number): Promise<boolean> {
    return this.demons.delete(id);
  }

  // Log entries
  async getLogEntries(): Promise<LogEntry[]> {
    return Array.from(this.logEntries.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getLogEntriesByDemon(demonId: number): Promise<LogEntry[]> {
    return Array.from(this.logEntries.values())
      .filter(e => e.demonId === demonId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createLogEntry(entry: InsertLogEntry): Promise<LogEntry> {
    const id = this.nextLogId++;
    const newEntry: LogEntry = { id, demonId: entry.demonId, cost: entry.cost ?? 0, timestamp: entry.timestamp };
    this.logEntries.set(id, newEntry);
    return newEntry;
  }

  async deleteLogEntry(id: number): Promise<boolean> {
    return this.logEntries.delete(id);
  }

  async clearAllLogEntries(): Promise<void> {
    this.logEntries.clear();
  }
}

export const storage = new MemStorage();
