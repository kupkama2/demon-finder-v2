export interface Demon {
  id: string;
  name: string;
  description: string;
  cost: number;
  color: string;
  prestige: number;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  demonId: string;
  timestamp: string;
  note: string;
  cost: number;
}

export interface KillPlan {
  id: string;
  demonId: string;
  strategy: string;
  targetDate: string;
  completed: boolean;
  createdAt: string;
}

export interface TradeGrade {
  id: string;
  date: string;
  grade: string;
  notes: string;
  pnl: number;
}

export interface DailyTrade {
  id: string;
  date: string;
  contracts: number;
  winRate: number;
  pnl: number;
  notes: string;
}

export interface WeeklyReview {
  id: string;
  weekStart: string;
  weekEnd: string;
  notes: string;
  topDemon: string;
  improvement: string;
  createdAt: string;
}

export interface AppData {
  demons: Demon[];
  logs: LogEntry[];
  killPlans: KillPlan[];
  tradeGrades: TradeGrade[];
  dailyTrades: DailyTrade[];
  weeklyReviews: WeeklyReview[];
  lastUpdated: string;
}

const LOCAL_KEY = 'demon_finder_data';
const GIST_TOKEN_KEY = 'gist_token';
const GIST_ID_KEY = 'gist_id';

export function getGistToken(): string | null {
  return localStorage.getItem(GIST_TOKEN_KEY);
}

export function setGistToken(token: string) {
  localStorage.setItem(GIST_TOKEN_KEY, token);
}

export function getGistId(): string | null {
  return localStorage.getItem(GIST_ID_KEY);
}

export function setGistId(id: string) {
  localStorage.setItem(GIST_ID_KEY, id);
}

export function loadLocalData(): AppData {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    demons: [],
    logs: [],
    killPlans: [],
    tradeGrades: [],
    dailyTrades: [],
    weeklyReviews: [],
    lastUpdated: new Date().toISOString(),
  };
}

export function saveLocalData(data: AppData) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }));
  } catch {}
}

export async function syncFromGist(): Promise<AppData | null> {
  const token = getGistToken();
  const gistId = getGistId();
  if (!token || !gistId) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;
    const gist = await res.json();
    const file = gist.files['demon-finder-data.json'];
    if (!file) return null;
    return JSON.parse(file.content) as AppData;
  } catch { return null; }
}

export async function syncToGist(data: AppData): Promise<boolean> {
  const token = getGistToken();
  const gistId = getGistId();
  if (!token || !gistId) return false;
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { 'demon-finder-data.json': { content: JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }) } },
      }),
    });
    return res.ok;
  } catch { return false; }
}