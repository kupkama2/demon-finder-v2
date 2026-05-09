const TOKEN_KEY = "demon-finder-gh-token";
const GIST_ID_KEY = "demon-finder-gist-id";
const DATA_FILENAME = "demon-finder-data.json";
const LOCAL_CACHE_KEY = "demon-finder-cache";

export interface Demon { id: number; name: string; sortOrder: number; }
export interface LogEntry { id: number; demonId: number; cost: number; timestamp: string; }

export type TpQuality = "perfect" | "too-early" | "too-late";
export type SlQuality = "perfect" | "too-wide" | "too-narrow";
export interface TradeGrade { id: number; tp: TpQuality | null; sl: SlQuality | null; timestamp: string; }

export interface KillPlan { demonId: number; note: string; createdAt: string; }

export type TradeResult = "win" | "loss";
export interface DailyTrade { id: number; result: TradeResult; pnl: number; timestamp: string; }

// Weekly review: combat plans for top 3 worst demons
export interface WeeklyCombatPlan {
  demonId: number;
  plan: string; // how you'll combat this demon
}
export interface WeeklyReview {
  weekStart: string; // ISO date string (Monday), e.g. "2026-03-16"
  completedAt: string; // when the user submitted the plans
  top3: { demonId: number; hits: number; cost: number; score: number }[];
  combatPlans: WeeklyCombatPlan[];
}

export interface StoredData {
  demons: Demon[]; logs: LogEntry[];
  tradeGrades: TradeGrade[]; nextGradeId: number;
  killPlans: KillPlan[];
  dailyTrades: DailyTrade[]; nextDailyTradeId: number;
  weeklyReviews: WeeklyReview[];
  nextDemonId: number; nextLogId: number; lastModified: string;
}

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

function defaultData(): StoredData {
  return { demons: [...DEFAULT_DEMONS], logs: [], tradeGrades: [], nextGradeId: 1, killPlans: [], dailyTrades: [], nextDailyTradeId: 1, weeklyReviews: [], nextDemonId: 10, nextLogId: 1, lastModified: new Date().toISOString() };
}

// Migration: ensure new fields exist on old caches
function migrateData(d: StoredData): StoredData {
  if (!d.tradeGrades) { d.tradeGrades = []; d.nextGradeId = 1; }
  if (!d.killPlans) { d.killPlans = []; }
  if (!d.dailyTrades) { d.dailyTrades = []; d.nextDailyTradeId = 1; }
  if (!d.weeklyReviews) { d.weeklyReviews = []; }
  return d;
}

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string): void { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GIST_ID_KEY); }

function getGistId(): string | null { return localStorage.getItem(GIST_ID_KEY); }
function setGistId(id: string): void { localStorage.setItem(GIST_ID_KEY, id); }

export function getLocalCache(): StoredData {
  try { const r = localStorage.getItem(LOCAL_CACHE_KEY); if (r) return migrateData(JSON.parse(r)); } catch {}
  return defaultData();
}
function setLocalCache(d: StoredData): void { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(d)); }

async function gistReq(method: string, path: string, body?: unknown): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error("No token");
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function findGist(): Promise<string | null> {
  const cached = getGistId();
  if (cached) { const r = await gistReq("GET", `/gists/${cached}`); if (r.ok) return cached; localStorage.removeItem(GIST_ID_KEY); }
  const r = await gistReq("GET", "/gists?per_page=100");
  if (!r.ok) return null;
  const gists = await r.json();
  for (const g of gists) { if (g.files?.[DATA_FILENAME]) { setGistId(g.id); return g.id; } }
  return null;
}

export async function loadFromGist(): Promise<StoredData> {
  if (!getToken()) return getLocalCache();
  try {
    const gistId = await findGist();
    if (!gistId) return getLocalCache();
    const r = await gistReq("GET", `/gists/${gistId}`);
    if (!r.ok) return getLocalCache();
    const g = await r.json();
    const content = g.files?.[DATA_FILENAME]?.content;
    if (!content) return getLocalCache();
    const data: StoredData = JSON.parse(content);
    setLocalCache(data);
    return data;
  } catch { return getLocalCache(); }
}

export async function saveToGist(data: StoredData): Promise<void> {
  data.lastModified = new Date().toISOString();
  setLocalCache(data);
  if (!getToken()) return;
  try {
    let gistId = await findGist();
    const payload = { files: { [DATA_FILENAME]: { content: JSON.stringify(data, null, 2) } } };
    if (!gistId) {
      const r = await gistReq("POST", "/gists", { description: "Demon Finder Data", public: false, ...payload });
      if (r.ok) { const g = await r.json(); setGistId(g.id); }
    } else {
      await gistReq("PATCH", `/gists/${gistId}`, payload);
    }
  } catch { console.warn("Gist sync failed, saved locally"); }
}

let pending: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(data: StoredData): void {
  setLocalCache(data);
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { saveToGist(data); pending = null; }, 1000);
}

export function getDemons(): Demon[] { return getLocalCache().demons.sort((a, b) => a.sortOrder - b.sortOrder); }
export function getLogs(): LogEntry[] { return getLocalCache().logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); }

export function createDemon(name: string): Demon {
  const d = getLocalCache(); const demon: Demon = { id: d.nextDemonId++, name, sortOrder: d.demons.length };
  d.demons.push(demon); debouncedSave(d); return demon;
}
export function updateDemon(id: number, name: string): Demon | null {
  const d = getLocalCache(); const demon = d.demons.find((x) => x.id === id);
  if (!demon) return null; demon.name = name; debouncedSave(d); return demon;
}
export function deleteDemon(id: number): boolean {
  const d = getLocalCache(); const i = d.demons.findIndex((x) => x.id === id);
  if (i === -1) return false; d.demons.splice(i, 1); debouncedSave(d); return true;
}
export function reorderDemons(orderedIds: number[]): void {
  const d = getLocalCache();
  orderedIds.forEach((id, idx) => {
    const demon = d.demons.find((x) => x.id === id);
    if (demon) demon.sortOrder = idx;
  });
  debouncedSave(d);
}
export function createLog(demonId: number, cost: number): LogEntry {
  const d = getLocalCache(); const e: LogEntry = { id: d.nextLogId++, demonId, cost, timestamp: new Date().toISOString() };
  d.logs.push(e); debouncedSave(d); return e;
}
export function deleteLog(id: number): boolean {
  const d = getLocalCache(); const i = d.logs.findIndex((x) => x.id === id);
  if (i === -1) return false; d.logs.splice(i, 1); debouncedSave(d); return true;
}
export function clearAllLogs(): void { const d = getLocalCache(); d.logs = []; d.nextLogId = 1; debouncedSave(d); }

// === Trade Grades ===
export function getTradeGrades(): TradeGrade[] { return getLocalCache().tradeGrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); }
export function createTradeGrade(tp: TpQuality | null, sl: SlQuality | null): TradeGrade {
  const d = getLocalCache(); const g: TradeGrade = { id: d.nextGradeId++, tp, sl, timestamp: new Date().toISOString() };
  d.tradeGrades.push(g); debouncedSave(d); return g;
}
export function deleteTradeGrade(id: number): boolean {
  const d = getLocalCache(); const i = d.tradeGrades.findIndex((x) => x.id === id);
  if (i === -1) return false; d.tradeGrades.splice(i, 1); debouncedSave(d); return true;
}
export function clearAllTradeGrades(): void { const d = getLocalCache(); d.tradeGrades = []; d.nextGradeId = 1; debouncedSave(d); }

// === Kill Plans ===
export function getKillPlan(demonId: number): KillPlan | undefined {
  return getLocalCache().killPlans.find((k) => k.demonId === demonId);
}
export function setKillPlan(demonId: number, note: string): KillPlan {
  const d = getLocalCache();
  const existing = d.killPlans.findIndex((k) => k.demonId === demonId);
  const plan: KillPlan = { demonId, note, createdAt: new Date().toISOString() };
  if (existing >= 0) { d.killPlans[existing] = plan; } else { d.killPlans.push(plan); }
  debouncedSave(d); return plan;
}
export function deleteKillPlan(demonId: number): boolean {
  const d = getLocalCache(); const i = d.killPlans.findIndex((k) => k.demonId === demonId);
  if (i === -1) return false; d.killPlans.splice(i, 1); debouncedSave(d); return true;
}

// === Daily Trades ===
export function getDailyTrades(): DailyTrade[] { return getLocalCache().dailyTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); }
export function createDailyTrade(result: TradeResult, pnl: number): DailyTrade {
  const d = getLocalCache(); const t: DailyTrade = { id: d.nextDailyTradeId++, result, pnl, timestamp: new Date().toISOString() };
  d.dailyTrades.push(t); debouncedSave(d); return t;
}
export function deleteDailyTrade(id: number): boolean {
  const d = getLocalCache(); const i = d.dailyTrades.findIndex((x) => x.id === id);
  if (i === -1) return false; d.dailyTrades.splice(i, 1); debouncedSave(d); return true;
}
export function clearTodayDailyTrades(): void {
  const d = getLocalCache();
  const today = new Date().toISOString().slice(0, 10);
  d.dailyTrades = d.dailyTrades.filter((t) => t.timestamp.slice(0, 10) !== today);
  debouncedSave(d);
}

// === Weekly Reviews ===
export function getWeeklyReviews(): WeeklyReview[] { return getLocalCache().weeklyReviews; }
export function getWeeklyReview(weekStart: string): WeeklyReview | undefined {
  return getLocalCache().weeklyReviews.find((r) => r.weekStart === weekStart);
}
export function saveWeeklyReview(review: WeeklyReview): void {
  const d = getLocalCache();
  const idx = d.weeklyReviews.findIndex((r) => r.weekStart === review.weekStart);
  if (idx >= 0) { d.weeklyReviews[idx] = review; } else { d.weeklyReviews.push(review); }
  debouncedSave(d);
}

export function exportDataJSON(): string {
  const d = getLocalCache();
  return JSON.stringify({ demons: d.demons, logs: d.logs, tradeGrades: d.tradeGrades, killPlans: d.killPlans, dailyTrades: d.dailyTrades, weeklyReviews: d.weeklyReviews, exportedAt: new Date().toISOString() }, null, 2);
}
export function importDataJSON(jsonStr: string): boolean {
  try {
    const imp = JSON.parse(jsonStr); const d = getLocalCache();
    if (imp.demons?.length) for (const x of imp.demons) { if (!d.demons.find((e: Demon) => e.name === x.name)) d.demons.push({ id: d.nextDemonId++, name: x.name, sortOrder: x.sortOrder ?? d.demons.length }); }
    if (imp.logs?.length) for (const x of imp.logs) { d.logs.push({ id: d.nextLogId++, demonId: x.demonId, cost: x.cost ?? 0, timestamp: x.timestamp }); }
    if (imp.tradeGrades?.length) for (const x of imp.tradeGrades) { d.tradeGrades.push({ id: d.nextGradeId++, tp: x.tp, sl: x.sl, timestamp: x.timestamp }); }
    if (imp.killPlans?.length) for (const x of imp.killPlans) { if (!d.killPlans.find((k: KillPlan) => k.demonId === x.demonId)) d.killPlans.push({ demonId: x.demonId, note: x.note, createdAt: x.createdAt }); }
    if (imp.dailyTrades?.length) for (const x of imp.dailyTrades) { d.dailyTrades.push({ id: d.nextDailyTradeId++, result: x.result, pnl: x.pnl, timestamp: x.timestamp }); }
    if (imp.weeklyReviews?.length) for (const x of imp.weeklyReviews) { if (!d.weeklyReviews.find((r: WeeklyReview) => r.weekStart === x.weekStart)) d.weeklyReviews.push(x); }
    debouncedSave(d); return true;
  } catch { return false; }
}

export async function validateToken(token: string): Promise<boolean> {
  try { const r = await fetch("https://api.github.com/user", { headers: { Authorization: `token ${token}` } }); return r.ok; } catch { return false; }
}
