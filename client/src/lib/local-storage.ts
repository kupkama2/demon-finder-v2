import { Demon, LogEntry, KillPlan, TradeGrade, DailyTrade, WeeklyReview } from './gist-storage';

const KEYS = {
  demons: 'df_demons',
  logs: 'df_logs',
  killPlans: 'df_killplans',
  tradeGrades: 'df_tradegrades',
  dailyTrades: 'df_dailytrades',
  weeklyReviews: 'df_weeklyreviews',
};

export function localGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function localSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getDemons(): Demon[] { return localGet(KEYS.demons, []); }
export function setDemons(d: Demon[]) { localSet(KEYS.demons, d); }
export function getLogs(): LogEntry[] { return localGet(KEYS.logs, []); }
export function setLogs(l: LogEntry[]) { localSet(KEYS.logs, l); }
export function getKillPlans(): KillPlan[] { return localGet(KEYS.killPlans, []); }
export function setKillPlans(k: KillPlan[]) { localSet(KEYS.killPlans, k); }
export function getTradeGrades(): TradeGrade[] { return localGet(KEYS.tradeGrades, []); }
export function setTradeGrades(t: TradeGrade[]) { localSet(KEYS.tradeGrades, t); }
export function getDailyTrades(): DailyTrade[] { return localGet(KEYS.dailyTrades, []); }
export function setDailyTrades(t: DailyTrade[]) { localSet(KEYS.dailyTrades, t); }
export function getWeeklyReviews(): WeeklyReview[] { return localGet(KEYS.weeklyReviews, []); }
export function setWeeklyReviews(r: WeeklyReview[]) { localSet(KEYS.weeklyReviews, r); }