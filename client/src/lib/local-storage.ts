// Local storage persistence for GitHub Pages (no backend)

export interface Demon {
  id: number;
  name: string;
  sortOrder: number;
}

export interface LogEntry {
  id: number;
  demonId: number;
  cost: number;
  timestamp: string;
}

interface StoredData {
  demons: Demon[];
  logs: LogEntry[];
  nextDemonId: number;
  nextLogId: number;
}

const STORAGE_KEY = "demon-finder-data";

const DEFAULT_DEMONS: Demon[] = [
  { id: 1, name: "Poor Risk/Reward Trade", sortOrder: 0 },
  { id: 2, name: "Entered Too Soon", sortOrder: 1 },
  { id: 3, name: "Entered Too Late", sortOrder: 2 },
  { id: 4, name: "Exited Too Soon", sortOrder: 3 },
  { id: 5, name: "Exited Too Late", sortOrder: 4 },
  { id: 6, name: "Trade Not In Trading Plan", sortOrder: 5 },
  { id: 7, name: "Incorrect Stop Placement", sortOrder: 6 },
  { id: 8, name: "Wrong Position Size", sortOrder: 7 },
  { id: 9, name: "Didn't Take Planned Trade", sortOrder: 8 },
];

function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        demons: parsed.demons || DEFAULT_DEMONS,
        logs: parsed.logs || [],
        nextDemonId: parsed.nextDemonId || 10,
        nextLogId: parsed.nextLogId || 1,
      };
    }
  } catch {
    // Corrupted data, reset
  }
  return {
    demons: [...DEFAULT_DEMONS],
    logs: [],
    nextDemonId: 10,
    nextLogId: 1,
  };
}

function saveData(data: StoredData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.error("Failed to save to localStorage");
  }
}

// === Demons ===

export function getDemons(): Demon[] {
  return loadData().demons.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createDemon(name: string): Demon {
  const data = loadData();
  const demon: Demon = {
    id: data.nextDemonId,
    name,
    sortOrder: data.demons.length,
  };
  data.demons.push(demon);
  data.nextDemonId++;
  saveData(data);
  return demon;
}

export function updateDemon(id: number, name: string): Demon | null {
  const data = loadData();
  const demon = data.demons.find((d) => d.id === id);
  if (!demon) return null;
  demon.name = name;
  saveData(data);
  return demon;
}

export function deleteDemon(id: number): boolean {
  const data = loadData();
  const idx = data.demons.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  data.demons.splice(idx, 1);
  saveData(data);
  return true;
}

// === Log Entries ===

export function getLogs(): LogEntry[] {
  return loadData().logs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function createLog(demonId: number, cost: number): LogEntry {
  const data = loadData();
  const entry: LogEntry = {
    id: data.nextLogId,
    demonId,
    cost,
    timestamp: new Date().toISOString(),
  };
  data.logs.push(entry);
  data.nextLogId++;
  saveData(data);
  return entry;
}

export function deleteLog(id: number): boolean {
  const data = loadData();
  const idx = data.logs.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  data.logs.splice(idx, 1);
  saveData(data);
  return true;
}

export function clearAllLogs(): void {
  const data = loadData();
  data.logs = [];
  data.nextLogId = 1;
  saveData(data);
}

// === Export / Import ===

export function exportData(): string {
  const data = loadData();
  return JSON.stringify(
    { demons: data.demons, logs: data.logs, exportedAt: new Date().toISOString() },
    null,
    2
  );
}

export function importData(jsonStr: string): boolean {
  try {
    const imported = JSON.parse(jsonStr);
    const data = loadData();

    if (imported.demons && Array.isArray(imported.demons)) {
      for (const d of imported.demons) {
        // Skip if a demon with this name already exists
        if (!data.demons.find((existing) => existing.name === d.name)) {
          data.demons.push({ id: data.nextDemonId++, name: d.name, sortOrder: d.sortOrder ?? data.demons.length });
        }
      }
    }

    if (imported.logs && Array.isArray(imported.logs)) {
      for (const l of imported.logs) {
        data.logs.push({
          id: data.nextLogId++,
          demonId: l.demonId,
          cost: l.cost ?? 0,
          timestamp: l.timestamp,
        });
      }
    }

    saveData(data);
    return true;
  } catch {
    return false;
  }
}
