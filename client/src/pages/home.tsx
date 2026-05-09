import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getDemons, createDemon as addDemonToStore, updateDemon as updateDemonInStore,
  deleteDemon as deleteDemonFromStore, reorderDemons, getLogs, createLog, deleteLog, clearAllLogs,
  getTradeGrades, createTradeGrade, deleteTradeGrade,
  getKillPlan, setKillPlan as saveKillPlan,
  getDailyTrades, createDailyTrade, deleteDailyTrade,
  getWeeklyReviews, getWeeklyReview, saveWeeklyReview,
  exportDataJSON, importDataJSON, getToken, loadFromGist,
  type Demon, type LogEntry, type TpQuality, type SlQuality, type TradeGrade,
  type TradeResult, type DailyTrade, type WeeklyReview,
} from "@/lib/gist-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Skull, Plus, Pencil, Trash2, DollarSign, Undo2, Download, Upload, Eraser,
  Flame, Target, AlertTriangle, Clock, Settings, GripVertical, ArrowUpDown,
  ArrowDownAZ, TrendingDown, Hash, Crosshair, Shield, Zap, FileText,
  Trophy, TrendingUp, Ban, Timer, ChevronUp, ChevronDown, Crown, Gem, Award, Star,
  Swords, ArrowRight, ArrowDown as ArrowDownIcon, ArrowUp as ArrowUpIcon, Minus, BookOpen,
} from "lucide-react";
import { Link } from "wouter";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { format, isToday, parseISO, differenceInSeconds, startOfWeek, endOfWeek, addDays, subWeeks, isWithinInterval, isBefore } from "date-fns";

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ===================== PRESTIGE SYSTEM =====================

interface PrestigeTier {
  name: string;
  minHits: number;
  icon: typeof Skull;
  color: string;         // text color
  bgColor: string;       // badge bg
  borderColor: string;   // card border
  glowColor: string;     // card bg tint
  badgeColor: string;    // prestige badge accent
}

const PRESTIGE_TIERS: PrestigeTier[] = [
  { name: "Base",      minHits: 0,  icon: Skull,  color: "text-muted-foreground", bgColor: "bg-muted/50",       borderColor: "border-border/60",     glowColor: "bg-card",           badgeColor: "" },
  { name: "Prestige I",  minHits: 10, icon: Skull,  color: "text-amber-600",       bgColor: "bg-amber-900/30",   borderColor: "border-amber-700/50",  glowColor: "bg-amber-950/20",   badgeColor: "text-amber-600" },
  { name: "Prestige II", minHits: 20, icon: Crown,  color: "text-slate-300",       bgColor: "bg-slate-500/20",   borderColor: "border-slate-400/40",  glowColor: "bg-slate-900/20",   badgeColor: "text-slate-300" },
  { name: "Prestige III",minHits: 30, icon: Crown,  color: "text-yellow-400",      bgColor: "bg-yellow-500/20",  borderColor: "border-yellow-500/40", glowColor: "bg-yellow-950/20",  badgeColor: "text-yellow-400" },
  { name: "Prestige IV", minHits: 40, icon: Gem,    color: "text-cyan-400",        bgColor: "bg-cyan-500/20",    borderColor: "border-cyan-400/40",   glowColor: "bg-cyan-950/20",    badgeColor: "text-cyan-400" },
  { name: "Prestige V",  minHits: 50, icon: Flame,  color: "text-red-400",         bgColor: "bg-red-500/25",     borderColor: "border-red-500/60",    glowColor: "bg-red-950/30",     badgeColor: "text-red-400" },
];

function getPrestige(count: number): { tier: PrestigeTier; level: number; prestigeNum: number } {
  let tier = PRESTIGE_TIERS[0];
  let prestigeNum = 0;
  for (let i = PRESTIGE_TIERS.length - 1; i >= 0; i--) {
    if (count >= PRESTIGE_TIERS[i].minHits) { tier = PRESTIGE_TIERS[i]; prestigeNum = i; break; }
  }
  const level = prestigeNum >= 5 ? count - 50 : count % 10;
  return { tier, level, prestigeNum };
}

// ===================== SORT CONFIG =====================

type SortMode = "custom" | "most-hits" | "highest-cost" | "alphabetical";

const SORT_LABELS: Record<SortMode, string> = {
  custom: "Custom", "most-hits": "Most Hits", "highest-cost": "Highest Cost", alphabetical: "A–Z",
};
const SORT_ICONS: Record<SortMode, typeof ArrowUpDown> = {
  custom: GripVertical, "most-hits": Hash, "highest-cost": TrendingDown, alphabetical: ArrowDownAZ,
};

// ===================== DAILY TRADE CONFIG =====================

const DAILY_LOSS_ALERT = 300;    // Warning at -$300
const DAILY_LOSS_STOP = 500;     // Hard stop at -$500
const LOSS_STREAK_LIMIT = 3;     // Force break after 3 losses
const COOLDOWN_SECONDS = 60;     // 60s cooldown after being stopped out

// Force re-render hook
function useForceUpdate() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((t) => t + 1), []);
}

// ===================== WEEKLY REPORT HELPERS =====================

/** Get the Monday of the week for a given date */
function getWeekMonday(date: Date): string {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

/** Get the previous week's Monday */
function getPrevWeekMonday(date: Date): string {
  return getWeekMonday(subWeeks(date, 1));
}

/** Check if a timestamp falls within a Mon-Sun week */
function isInWeek(timestamp: string, weekMonday: string): boolean {
  const d = parseISO(timestamp);
  const start = parseISO(weekMonday);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return isWithinInterval(d, { start, end });
}

interface WeekDemonStat {
  demonId: number;
  demonName: string;
  hits: number;
  cost: number; // positive = loss, negative = profit
  score: number; // weighted: hits * 10 + cost
}

/** Compute top 3 worst demons for a week based on logs */
function computeWeekStats(logs: LogEntry[], demons: Demon[], weekMonday: string): WeekDemonStat[] {
  const weekLogs = logs.filter((l) => isInWeek(l.timestamp, weekMonday));
  const map: Record<number, { hits: number; cost: number }> = {};
  for (const log of weekLogs) {
    if (!map[log.demonId]) map[log.demonId] = { hits: 0, cost: 0 };
    map[log.demonId].hits++;
    map[log.demonId].cost += log.cost; // positive = loss, negative = profit
  }
  return Object.entries(map).map(([id, { hits, cost }]) => {
    const demonId = Number(id);
    const demon = demons.find((d) => d.id === demonId);
    return {
      demonId,
      demonName: demon?.name ?? "Unknown",
      hits,
      cost,
      score: hits * 10 + Math.max(0, cost), // weight: each hit = 10pts, each $1 loss = 1pt
    };
  }).sort((a, b) => b.score - a.score);
}

/** Check if a weekly review is needed (last week has ended & no review submitted) */
function needsWeeklyReview(now: Date): { needed: boolean; weekMonday: string } {
  const lastWeekMonday = getPrevWeekMonday(now);
  const thisWeekMonday = getWeekMonday(now);
  // Only needed if: we're in a new week AND no review exists for last week
  if (lastWeekMonday === thisWeekMonday) return { needed: false, weekMonday: lastWeekMonday };
  const existing = getWeeklyReview(lastWeekMonday);
  return { needed: !existing, weekMonday: lastWeekMonday };
}

// ===================== MAIN COMPONENT =====================

export default function Home() {
  const { toast } = useToast();
  const forceUpdate = useForceUpdate();

  // Sync from Gist on mount
  const [syncing, setSyncing] = useState(true);
  useEffect(() => {
    if (getToken()) {
      loadFromGist().then(() => { setSyncing(false); forceUpdate(); });
    } else { setSyncing(false); }
  }, []);

  // Read directly from localStorage each render
  const demons = getDemons();
  const logs = getLogs();
  const tradeGrades = getTradeGrades();
  const dailyTrades = getDailyTrades();

  // ===== Weekly Review Gate =====
  const [weeklyReviewDismissed, setWeeklyReviewDismissed] = useState(false);
  const [showPastReports, setShowPastReports] = useState(false);
  const weeklyCheck = useMemo(() => needsWeeklyReview(new Date()), [syncing]);
  const showWeeklyGate = weeklyCheck.needed && !weeklyReviewDismissed && !syncing;

  // TP & SL instant log
  const handleLogTp = (tp: TpQuality) => {
    createTradeGrade(tp, null);
    forceUpdate();
    toast({ title: "TP logged", description: `Take-profit: ${tp === "perfect" ? "Perfect" : tp === "too-early" ? "Early" : "Late"}` });
  };
  const handleLogSl = (sl: SlQuality) => {
    createTradeGrade(null, sl);
    forceUpdate();
    toast({ title: "SL logged", description: `Stop-loss: ${sl === "perfect" ? "Perfect" : sl === "too-wide" ? "Wide" : "Narrow"}` });
  };
  const handleUndoGrade = () => {
    if (tradeGrades.length === 0) return;
    deleteTradeGrade(tradeGrades[0].id);
    forceUpdate();
    toast({ title: "Undone", description: "Last trade grade removed." });
  };

  // Kill Plan mechanic
  const [killPlanDemon, setKillPlanDemon] = useState<Demon | null>(null);
  const [killPlanNote, setKillPlanNote] = useState("");

  // Sort mode
  const [sortMode, setSortMode] = useState<SortMode>("custom");

  // Modal states
  const [addDemonOpen, setAddDemonOpen] = useState(false);
  const [editDemon, setEditDemon] = useState<Demon | null>(null);
  const [deleteDemonConfirm, setDeleteDemonConfirm] = useState<Demon | null>(null);
  const [clearLogsConfirm, setClearLogsConfirm] = useState(false);
  const [newDemonName, setNewDemonName] = useState("");
  const [editDemonName, setEditDemonName] = useState("");

  // Cost input state per demon
  const [costInputs, setCostInputs] = useState<Record<number, string>>({});

  // ===== Daily Trade state =====
  const [tradePnlInput, setTradePnlInput] = useState("");

  // Cooldown timer
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldownEnd) {
      const tick = () => {
        const rem = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
        setCooldownRemaining(rem);
        if (rem <= 0) {
          setCooldownEnd(null);
          if (cooldownRef.current) clearInterval(cooldownRef.current);
        }
      };
      tick();
      cooldownRef.current = setInterval(tick, 1000);
      return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
    }
  }, [cooldownEnd]);

  // === Actions ===

  const handleLog = (demonId: number) => {
    const costStr = (costInputs[demonId] || "0").trim();
    const rawValue = parseFloat(costStr) || 0;
    const isProfit = costStr.startsWith("+");
    const cost = isProfit ? -Math.abs(rawValue) : Math.abs(rawValue);
    createLog(demonId, cost);
    setCostInputs((prev) => ({ ...prev, [demonId]: "" }));
    forceUpdate();

    // Check if demon just hit a prestige threshold and has no kill plan yet
    const newCount = (stats.demonCounts[demonId]?.count ?? 0) + 1;
    if (newCount === 10 && !getKillPlan(demonId)) {
      const demon = demons.find((d) => d.id === demonId);
      if (demon) { setKillPlanDemon(demon); setKillPlanNote(""); }
    }
  };

  const handleSaveKillPlan = () => {
    if (!killPlanDemon || !killPlanNote.trim()) return;
    saveKillPlan(killPlanDemon.id, killPlanNote.trim());
    setKillPlanDemon(null);
    setKillPlanNote("");
    forceUpdate();
    toast({ title: "Kill Plan saved", description: "Time to execute it. No excuses." });
  };

  const handleUndo = () => {
    if (logs.length === 0) return;
    deleteLog(logs[0].id);
    forceUpdate();
    toast({ title: "Undone", description: "Last log entry removed." });
  };

  const handleAddDemon = () => {
    if (!newDemonName.trim()) return;
    addDemonToStore(newDemonName.trim());
    setAddDemonOpen(false);
    setNewDemonName("");
    forceUpdate();
    toast({ title: "Demon added", description: "New trading demon created." });
  };

  const handleUpdateDemon = () => {
    if (!editDemon || !editDemonName.trim()) return;
    updateDemonInStore(editDemon.id, editDemonName.trim());
    setEditDemon(null);
    setEditDemonName("");
    forceUpdate();
    toast({ title: "Updated", description: "Demon renamed." });
  };

  const handleDeleteDemon = () => {
    if (!deleteDemonConfirm) return;
    deleteDemonFromStore(deleteDemonConfirm.id);
    setDeleteDemonConfirm(null);
    forceUpdate();
    toast({ title: "Removed", description: "Demon deleted." });
  };

  const handleClearLogs = () => {
    clearAllLogs();
    setClearLogsConfirm(false);
    forceUpdate();
    toast({ title: "Cleared", description: "All log entries removed." });
  };

  const handleExport = () => {
    const data = exportDataJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demon-finder-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Data downloaded as JSON." });
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (importDataJSON(text)) {
          forceUpdate();
          toast({ title: "Imported", description: "Data loaded from file." });
        } else {
          toast({ title: "Error", description: "Failed to parse file.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Error", description: "Failed to read file.", variant: "destructive" });
      }
    };
    input.click();
  };

  // ===== Daily trade actions =====

  const handleDailyTrade = (result: TradeResult) => {
    const pnlStr = tradePnlInput.trim();
    const rawPnl = parseFloat(pnlStr) || 0;
    const isPositive = pnlStr.startsWith("+");
    const pnl = result === "win" ? Math.abs(rawPnl) : -(Math.abs(rawPnl));
    // If user manually typed sign, use it; otherwise infer from W/L
    const finalPnl = pnlStr.startsWith("-") ? -Math.abs(rawPnl) : isPositive ? Math.abs(rawPnl) : pnl;

    createDailyTrade(result, finalPnl);
    setTradePnlInput("");
    forceUpdate();

    // Start cooldown if loss
    if (result === "loss") {
      setCooldownEnd(Date.now() + COOLDOWN_SECONDS * 1000);
    }

    // Trade count alerts
    const newTotal = dailyStats.total + 1;
    if (newTotal === 10) {
      toast({ title: "10 trades today", description: "Major milestone. Are you trading your plan or overtrading?", variant: "destructive" });
    } else if (newTotal === 15) {
      toast({ title: "15 trades today", description: "This is a lot. Seriously consider stopping.", variant: "destructive" });
    } else if (newTotal > 0 && newTotal % 5 === 0) {
      toast({ title: `${newTotal} trades today`, description: "Check yourself. Quality over quantity." });
    } else {
      toast({
        title: result === "win" ? "Win logged" : "Loss logged",
        description: `PnL: ${finalPnl >= 0 ? "+" : ""}$${finalPnl.toFixed(2)}`,
      });
    }
  };

  const handleUndoDailyTrade = () => {
    if (dailyTrades.length === 0) return;
    deleteDailyTrade(dailyTrades[0].id);
    forceUpdate();
    toast({ title: "Undone", description: "Last trade removed." });
  };

  // === Computed stats ===

  const stats = useMemo(() => {
    const demonCounts: Record<number, { count: number; cost: number }> = {};
    let totalCost = 0;
    let todayCount = 0;
    let todayCost = 0;

    logs.forEach((log) => {
      if (!demonCounts[log.demonId]) { demonCounts[log.demonId] = { count: 0, cost: 0 }; }
      demonCounts[log.demonId].count++;
      demonCounts[log.demonId].cost += log.cost ?? 0;
      totalCost += log.cost ?? 0;
      if (isToday(parseISO(log.timestamp))) { todayCount++; todayCost += log.cost ?? 0; }
    });

    let worstDemonId = 0;
    let worstCount = 0;
    Object.entries(demonCounts).forEach(([id, data]) => {
      if (data.count > worstCount) { worstCount = data.count; worstDemonId = parseInt(id); }
    });
    const worstDemon = demons.find((d) => d.id === worstDemonId);

    return { demonCounts, totalCost, todayCount, todayCost, worstDemon, worstCount, totalLogs: logs.length };
  }, [logs, demons]);

  // Daily trade stats
  const dailyStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = dailyTrades.filter((t) => t.timestamp.slice(0, 10) === today);
    const wins = todayTrades.filter((t) => t.result === "win").length;
    const losses = todayTrades.filter((t) => t.result === "loss").length;
    const pnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

    // Current streak
    let streak = 0;
    let streakType: TradeResult | null = null;
    for (const t of todayTrades) {
      if (!streakType) { streakType = t.result; streak = 1; }
      else if (t.result === streakType) { streak++; }
      else break;
    }

    // Time since last trade
    const lastTrade = todayTrades[0];
    const lastTradeTime = lastTrade ? parseISO(lastTrade.timestamp) : null;
    const secsSinceLast = lastTradeTime ? differenceInSeconds(new Date(), lastTradeTime) : null;

    // Is stopped out? 3 consecutive losses or daily PnL <= -$500
    const isLossStreakHalt = streakType === "loss" && streak >= LOSS_STREAK_LIMIT;
    const isDailyStopHit = pnl <= -DAILY_LOSS_STOP;
    const isDailyWarning = pnl <= -DAILY_LOSS_ALERT && pnl > -DAILY_LOSS_STOP;

    return { todayTrades, wins, losses, pnl, streak, streakType, lastTradeTime, secsSinceLast, isLossStreakHalt, isDailyStopHit, isDailyWarning, total: todayTrades.length };
  }, [dailyTrades]);

  const getDemonCount = (demonId: number) => stats.demonCounts[demonId]?.count ?? 0;
  const getDemonCost = (demonId: number) => stats.demonCounts[demonId]?.cost ?? 0;

  // === Sorted demons ===

  const sortedDemons = useMemo(() => {
    const arr = [...demons];
    switch (sortMode) {
      case "most-hits": return arr.sort((a, b) => getDemonCount(b.id) - getDemonCount(a.id));
      case "highest-cost": return arr.sort((a, b) => getDemonCost(b.id) - getDemonCost(a.id));
      case "alphabetical": return arr.sort((a, b) => a.name.localeCompare(b.name));
      default: return arr;
    }
  }, [demons, sortMode, stats]);

  const recentLogs = useMemo(() => {
    return logs.slice(0, 10).map((log) => ({
      ...log,
      demonName: demons.find((d) => d.id === log.demonId)?.name ?? "Unknown",
    }));
  }, [logs, demons]);

  // === Drag & Drop ===

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedDemons.findIndex((d) => d.id === active.id);
    const newIndex = sortedDemons.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sortedDemons, oldIndex, newIndex);
    reorderDemons(reordered.map((d) => d.id));
    forceUpdate();
  };

  const isDraggable = sortMode === "custom";

  // Is trading blocked?
  const isCooldownActive = cooldownEnd !== null && cooldownRemaining > 0;
  const isTradingBlocked = dailyStats.isDailyStopHit || (dailyStats.isLossStreakHalt && isCooldownActive);

  return (
    <div className="min-h-screen bg-background">
      {/* Weekly Review Gate */}
      {showWeeklyGate && (
        <WeeklyReportOverlay
          weekMonday={weeklyCheck.weekMonday}
          logs={logs}
          demons={demons}
          onComplete={() => { setWeeklyReviewDismissed(true); forceUpdate(); toast({ title: "Weekly review submitted", description: "Go crush it this week." }); }}
        />
      )}

      {/* Past Reports Dialog */}
      {showPastReports && (
        <PastReportsOverlay
          logs={logs}
          demons={demons}
          onClose={() => setShowPastReports(false)}
        />
      )}

      {/* Header */}
      <header className="border-b border-border/60 px-4 py-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
              <Skull className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight" data-testid="text-title">Demon Finder</h1>
              <p className="text-xs text-muted-foreground">Kill your trading demons</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleExport} data-testid="button-export" className="text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button variant="ghost" size="sm" onClick={handleImport} data-testid="button-import" className="text-xs gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Import
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPastReports(true)} data-testid="button-reports" className="text-xs gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Reports
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="sm" data-testid="button-settings" className="text-xs gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Sync
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Flame className="w-4 h-4 text-red-400" />} label="Total Demons Hit" value={stats.totalLogs} testId="stat-total" />
          <StatCard
            icon={<DollarSign className="w-4 h-4 text-amber-400" />}
            label="Net Cost"
            value={stats.totalCost > 0 ? `-$${stats.totalCost.toFixed(2)}` : stats.totalCost < 0 ? `+$${Math.abs(stats.totalCost).toFixed(2)}` : "$0.00"}
            testId="stat-cost" danger={stats.totalCost > 0} success={stats.totalCost < 0}
          />
          <StatCard
            icon={<Target className="w-4 h-4 text-orange-400" />}
            label="Today"
            value={`${stats.todayCount} / ${stats.todayCost > 0 ? "-" : stats.todayCost < 0 ? "+" : ""}$${Math.abs(stats.todayCost).toFixed(2)}`}
            testId="stat-today"
          />
          <StatCard
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            label="Worst Demon"
            value={stats.worstDemon?.name ?? "None"}
            subValue={stats.worstCount > 0 ? `${stats.worstCount}x` : undefined}
            testId="stat-worst" small
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Demon grid */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Demons</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" data-testid="button-sort" className="text-xs gap-1.5 h-7 px-2 text-muted-foreground hover:text-foreground">
                      {(() => { const Icon = SORT_ICONS[sortMode]; return <Icon className="w-3.5 h-3.5" />; })()}
                      {SORT_LABELS[sortMode]}
                      <ArrowUpDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => {
                      const Icon = SORT_ICONS[mode];
                      return (
                        <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)} data-testid={`sort-option-${mode}`}
                          className={`text-xs gap-2 ${sortMode === mode ? "text-red-400 font-medium" : ""}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {SORT_LABELS[mode]}
                          {mode === "custom" && <span className="text-[10px] text-muted-foreground ml-auto">drag</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleUndo} disabled={logs.length === 0} data-testid="button-undo" className="text-xs gap-1.5">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setClearLogsConfirm(true)} disabled={logs.length === 0} data-testid="button-clear" className="text-xs gap-1.5 text-destructive hover:text-destructive">
                  <Eraser className="w-3.5 h-3.5" /> Clear All
                </Button>
                <Button size="sm" onClick={() => setAddDemonOpen(true)} data-testid="button-add-demon" className="text-xs gap-1.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 border-0">
                  <Plus className="w-3.5 h-3.5" /> Add Demon
                </Button>
              </div>
            </div>

            {isDraggable ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedDemons.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {sortedDemons.map((demon) => (
                      <SortableDemonCard key={demon.id} demon={demon} count={getDemonCount(demon.id)} cost={getDemonCost(demon.id)}
                        costInput={costInputs[demon.id] || ""} onCostChange={(val) => setCostInputs((prev) => ({ ...prev, [demon.id]: val }))}
                        onLog={() => handleLog(demon.id)} onEdit={() => { setEditDemon(demon); setEditDemonName(demon.name); }}
                        onDelete={() => setDeleteDemonConfirm(demon)} isDraggable killPlanNote={getKillPlan(demon.id)?.note} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="space-y-2">
                {sortedDemons.map((demon) => (
                  <DemonCard key={demon.id} demon={demon} count={getDemonCount(demon.id)} cost={getDemonCost(demon.id)}
                    costInput={costInputs[demon.id] || ""} onCostChange={(val) => setCostInputs((prev) => ({ ...prev, [demon.id]: val }))}
                    onLog={() => handleLog(demon.id)} onEdit={() => { setEditDemon(demon); setEditDemonName(demon.name); }}
                    onDelete={() => setDeleteDemonConfirm(demon)} isDraggable={false} killPlanNote={getKillPlan(demon.id)?.note} />
                ))}
              </div>
            )}

            {demons.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Skull className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No demons yet. Add your first trading demon above.</p>
              </div>
            )}

            {/* Motivational banner */}
            <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-sm font-semibold text-red-400 mb-1">Demons will destroy your edge.</p>
              <p className="text-xs text-muted-foreground">
                Learn from your errors. It is the only way to achieve success. Your future profitability depends on killing the demons.
              </p>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Daily Trade Log */}
            <DailyTradeCard
              dailyStats={dailyStats}
              pnlInput={tradePnlInput}
              onPnlChange={setTradePnlInput}
              onLogTrade={handleDailyTrade}
              onUndoTrade={handleUndoDailyTrade}
              isTradingBlocked={isTradingBlocked}
              isCooldownActive={isCooldownActive}
              cooldownRemaining={cooldownRemaining}
            />

            {/* TP & SL Quick Log */}
            <TradeGradeCard onLogTp={handleLogTp} onLogSl={handleLogSl} onUndo={handleUndoGrade} gradeCount={tradeGrades.length} />

            {/* Grade Distribution */}
            <GradeDistribution grades={tradeGrades} />

            {/* Recent Logs (demon hits) */}
            <Card className="border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recent Logs</h3>
              </div>
              {recentLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No logs yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentLogs.map((log) => (
                    <div key={log.id} data-testid={`log-entry-${log.id}`} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{log.demonName}</p>
                        <p className="text-muted-foreground text-[10px]">{format(parseISO(log.timestamp), "MMM d, HH:mm")}</p>
                      </div>
                      {(log.cost ?? 0) !== 0 && (
                        <span className={`font-mono ml-2 ${(log.cost ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {(log.cost ?? 0) > 0 ? `-$${(log.cost ?? 0).toFixed(2)}` : `+$${Math.abs(log.cost ?? 0).toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Showing {recentLogs.length} of {logs.length} entries
              </p>
            </Card>

            <Card className="border-border/60 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Cost Breakdown</h3>
              {demons.filter((d) => getDemonCost(d.id) !== 0).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No costs logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {demons.filter((d) => getDemonCost(d.id) !== 0).sort((a, b) => getDemonCost(b.id) - getDemonCost(a.id)).map((demon) => {
                    const dCost = getDemonCost(demon.id);
                    const absCost = Math.abs(dCost);
                    const maxAbsCost = Math.max(...demons.map((d) => Math.abs(getDemonCost(d.id))));
                    const pct = maxAbsCost > 0 ? (absCost / maxAbsCost) * 100 : 0;
                    const isProfit = dCost < 0;
                    return (
                      <div key={demon.id} data-testid={`breakdown-${demon.id}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="truncate font-medium">{demon.name}</span>
                          <span className={`font-mono shrink-0 ml-2 ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                            {isProfit ? `+$${absCost.toFixed(2)}` : `-$${absCost.toFixed(2)}`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isProfit ? "bg-emerald-500/70" : "bg-red-500/70"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="border-border/60 bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Rules</h3>
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
                <li>Log each demon every time you commit the error.</li>
                <li>Determine which demon is outpacing the rest and kill it first.</li>
                <li>Once you've killed the worst demon, move onto the next.</li>
                <li>When a demon hits <span className="text-red-400 font-semibold">10</span>, you must write a Kill Plan — a concrete change to stop the pattern.</li>
                <li>Demons <span className="text-amber-500 font-semibold">prestige</span> every 10 hits. More prestige = more dangerous.</li>
              </ol>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/40 mt-12 py-4 px-4">
        <div className="max-w-6xl mx-auto">
          <PerplexityAttribution />
        </div>
      </footer>

      {/* Add Demon Dialog */}
      <Dialog open={addDemonOpen} onOpenChange={setAddDemonOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add New Demon</DialogTitle></DialogHeader>
          <Input placeholder="e.g. Revenge Trading" value={newDemonName} onChange={(e) => setNewDemonName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddDemon(); }} data-testid="input-new-demon-name" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDemonOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDemon} disabled={!newDemonName.trim()} data-testid="button-confirm-add-demon" className="bg-red-600 hover:bg-red-700 text-white">Add Demon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Demon Dialog */}
      <Dialog open={!!editDemon} onOpenChange={(open) => !open && setEditDemon(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Demon</DialogTitle></DialogHeader>
          <Input value={editDemonName} onChange={(e) => setEditDemonName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleUpdateDemon(); }} data-testid="input-edit-demon-name" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDemon(null)}>Cancel</Button>
            <Button onClick={handleUpdateDemon} disabled={!editDemonName.trim()} data-testid="button-confirm-edit-demon">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Demon Confirm */}
      <AlertDialog open={!!deleteDemonConfirm} onOpenChange={(open) => { if (!open) setDeleteDemonConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteDemonConfirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the demon. Log entries referencing it will remain but won't show a name.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteDemon(); }} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-demon">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kill Plan Dialog */}
      <Dialog open={!!killPlanDemon} onOpenChange={(open) => { if (!open) setKillPlanDemon(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-400" />
              <span>{killPlanDemon?.name} hit 10</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This demon has struck 10 times. Write a Kill Plan — what specific change will you make to stop this pattern?
            </p>
            <Textarea placeholder="e.g. I will wait for the 5-min candle close before entering. No exceptions."
              value={killPlanNote} onChange={(e) => setKillPlanNote(e.target.value)}
              className="min-h-[80px] text-sm" data-testid="input-kill-plan" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKillPlanDemon(null)}>Skip</Button>
            <Button onClick={handleSaveKillPlan} disabled={!killPlanNote.trim()} data-testid="button-save-kill-plan" className="bg-red-600 hover:bg-red-700 text-white">Save Kill Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Logs Confirm */}
      <AlertDialog open={clearLogsConfirm} onOpenChange={setClearLogsConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all log entries?</AlertDialogTitle>
            <AlertDialogDescription>This will remove all recorded demon hits and costs. This cannot be undone. Consider exporting first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleClearLogs(); }} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-clear-logs">Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ===================== DAILY TRADE CARD =====================

interface DailyStatsType {
  todayTrades: DailyTrade[];
  wins: number; losses: number; pnl: number;
  streak: number; streakType: TradeResult | null;
  lastTradeTime: Date | null; secsSinceLast: number | null;
  isLossStreakHalt: boolean; isDailyStopHit: boolean; isDailyWarning: boolean;
  total: number;
}

function DailyTradeCard({ dailyStats, pnlInput, onPnlChange, onLogTrade, onUndoTrade, isTradingBlocked, isCooldownActive, cooldownRemaining }: {
  dailyStats: DailyStatsType;
  pnlInput: string;
  onPnlChange: (v: string) => void;
  onLogTrade: (r: TradeResult) => void;
  onUndoTrade: () => void;
  isTradingBlocked: boolean;
  isCooldownActive: boolean;
  cooldownRemaining: number;
}) {
  const { wins, losses, pnl, streak, streakType, lastTradeTime, isLossStreakHalt, isDailyStopHit, isDailyWarning, total } = dailyStats;

  // Real-time "last trade" ticker
  const [liveSecsSince, setLiveSecsSince] = useState<number | null>(null);
  useEffect(() => {
    if (!lastTradeTime) { setLiveSecsSince(null); return; }
    const update = () => setLiveSecsSince(Math.max(0, Math.floor((Date.now() - lastTradeTime.getTime()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastTradeTime]);

  const borderClass = isDailyStopHit ? "border-red-500/60 bg-red-950/30"
    : isDailyWarning ? "border-amber-500/40 bg-amber-950/20"
    : isLossStreakHalt ? "border-red-500/40 bg-red-950/20"
    : "border-border/60 bg-card";

  return (
    <Card className={`p-4 ${borderClass}`} data-testid="card-daily-trade">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Daily Trading</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onUndoTrade} disabled={total === 0}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground" data-testid="button-undo-daily">
          <Undo2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">W / L</p>
          <p className="text-sm font-bold font-mono">
            <span className="text-emerald-400">{wins}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-red-400">{losses}</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL</p>
          <p className={`text-sm font-bold font-mono ${pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-foreground"}`}>
            {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Streak</p>
          <p className={`text-sm font-bold font-mono ${streakType === "win" ? "text-emerald-400" : streakType === "loss" ? "text-red-400" : "text-muted-foreground"}`}>
            {streak > 0 ? `${streak}${streakType === "win" ? "W" : "L"}` : "—"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades</p>
          <p className={`text-sm font-bold font-mono ${total >= 10 ? "text-red-400" : total >= 5 ? "text-amber-400" : "text-foreground"}`}>
            {total}
          </p>
        </div>
      </div>

      {/* Time since last trade */}
      {liveSecsSince !== null && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
          <Timer className="w-3 h-3" />
          <span>Last trade: {liveSecsSince < 60 ? `${liveSecsSince}s ago` : liveSecsSince < 3600 ? `${Math.floor(liveSecsSince / 60)}m ${liveSecsSince % 60}s ago` : `${Math.floor(liveSecsSince / 3600)}h ${Math.floor((liveSecsSince % 3600) / 60)}m ago`}</span>
        </div>
      )}

      {/* Trade count alert */}
      {total >= 10 && !isDailyStopHit && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {total} trades today — overtrading?
          </p>
          <p className="text-[10px] text-red-400/70 mt-0.5">Step back and ask: am I following my plan?</p>
        </div>
      )}
      {total >= 5 && total < 10 && !isDailyStopHit && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 mb-3">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" /> {total} trades — check yourself
          </p>
        </div>
      )}

      {/* Alerts */}
      {isDailyStopHit && (
        <div className="rounded-md bg-red-500/15 border border-red-500/30 px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5" /> Daily stop hit (-${DAILY_LOSS_STOP})
          </p>
          <p className="text-[10px] text-red-400/70 mt-0.5">Done for the day. Walk away.</p>
        </div>
      )}
      {isDailyWarning && !isDailyStopHit && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Warning: PnL at -${Math.abs(pnl).toFixed(0)}
          </p>
          <p className="text-[10px] text-amber-400/70 mt-0.5">Stop at -${DAILY_LOSS_STOP}. Slow down.</p>
        </div>
      )}
      {isLossStreakHalt && !isDailyStopHit && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5" /> {LOSS_STREAK_LIMIT} losses in a row
          </p>
          {isCooldownActive ? (
            <p className="text-[10px] text-red-400/70 mt-0.5">Forced break: {cooldownRemaining}s remaining</p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-0.5">Cooldown complete. Trade carefully.</p>
          )}
        </div>
      )}

      {/* PnL input + Win/Loss buttons */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input type="text" inputMode="decimal" placeholder="PnL" value={pnlInput}
            onChange={(e) => onPnlChange(e.target.value)}
            className="h-9 pl-6 text-xs font-mono bg-background border-border/60"
            data-testid="input-daily-pnl" disabled={isTradingBlocked} />
        </div>
        <Button size="sm" onClick={() => onLogTrade("win")} disabled={isTradingBlocked}
          data-testid="button-daily-win"
          className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-30">
          <ChevronUp className="w-3.5 h-3.5 mr-1" /> WIN
        </Button>
        <Button size="sm" onClick={() => onLogTrade("loss")} disabled={isTradingBlocked}
          data-testid="button-daily-loss"
          className="h-9 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-30">
          <ChevronDown className="w-3.5 h-3.5 mr-1" /> LOSS
        </Button>
      </div>
    </Card>
  );
}

// ===================== DEMON CARDS WITH PRESTIGE =====================

interface DemonCardProps {
  demon: Demon; count: number; cost: number;
  costInput: string; onCostChange: (val: string) => void;
  onLog: () => void; onEdit: () => void; onDelete: () => void;
  isDraggable: boolean; killPlanNote?: string;
  dragHandleProps?: Record<string, unknown>;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLElement | null) => void;
}

function DemonCardInner({ demon, count, cost, costInput, onCostChange, onLog, onEdit, onDelete, isDraggable, killPlanNote, dragHandleProps }: DemonCardProps) {
  const { tier, level, prestigeNum } = getPrestige(count);
  const PrestigeIcon = tier.icon;

  return (
    <>
      {isDraggable && (
        <div {...dragHandleProps} className="flex items-center justify-center w-6 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors touch-none"
          data-testid={`drag-handle-${demon.id}`}>
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Prestige icon + count */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`w-9 h-9 rounded-md flex flex-col items-center justify-center shrink-0 ${tier.bgColor} relative`}
              data-testid={`badge-count-${demon.id}`}>
              <span className={`text-sm font-mono font-bold leading-none ${tier.color}`}>{count}</span>
              {prestigeNum > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-background border border-border flex items-center justify-center">
                  <span className={`text-[8px] font-bold ${tier.badgeColor}`}>{prestigeNum}</span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className={`font-semibold ${tier.badgeColor || "text-foreground"}`}>{tier.name}</p>
            {prestigeNum > 0 && <p className="text-muted-foreground">{count} total hits</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Name + cost + kill plan badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate" data-testid={`text-demon-name-${demon.id}`}>{demon.name}</p>
          {killPlanNote && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 cursor-help"><FileText className="w-3.5 h-3.5 text-amber-400" /></span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  <p className="font-semibold text-amber-400 mb-1">Kill Plan</p>
                  <p>{killPlanNote}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {cost !== 0 && (
          <p className={`text-xs font-mono ${cost > 0 ? "text-red-400/80" : "text-emerald-400/80"}`} data-testid={`text-demon-cost-${demon.id}`}>
            {cost > 0 ? `-$${cost.toFixed(2)}` : `+$${Math.abs(cost).toFixed(2)}`}
          </p>
        )}
      </div>

      {/* Progress dots — show progress within current prestige tier */}
      <div className="hidden sm:flex items-center gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
            i < level
              ? prestigeNum >= 5 ? "bg-red-500" : prestigeNum >= 3 ? "bg-yellow-500" : prestigeNum >= 1 ? "bg-amber-500" : "bg-muted-foreground/60"
              : "bg-muted/40"
          }`} />
        ))}
      </div>

      {/* Cost input + log button */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative">
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input type="text" inputMode="decimal" placeholder="0" value={costInput}
            onChange={(e) => onCostChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onLog(); }}
            className="w-20 h-8 pl-6 text-xs font-mono bg-background border-border/60"
            data-testid={`input-cost-${demon.id}`} />
        </div>
        <Button size="sm" onClick={onLog} data-testid={`button-log-${demon.id}`} className="h-8 px-3 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white">
          Log
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`button-edit-${demon.id}`} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} data-testid={`button-delete-${demon.id}`} className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </>
  );
}

function DemonCard(props: Omit<DemonCardProps, "dragHandleProps" | "style" | "setNodeRef">) {
  const { demon, count } = props;
  const { tier, prestigeNum } = getPrestige(count);

  return (
    <Card data-testid={`card-demon-${demon.id}`}
      className={`relative flex items-center gap-3 px-4 py-3 border transition-colors ${
        prestigeNum >= 5 ? `${tier.borderColor} ${tier.glowColor}`
        : prestigeNum >= 1 ? `${tier.borderColor} ${tier.glowColor}`
        : count >= 5 ? "border-amber-500/30 bg-amber-500/5"
        : "border-border/60 bg-card"
      }`}>
      <DemonCardInner {...props} />
    </Card>
  );
}

function SortableDemonCard(props: Omit<DemonCardProps, "dragHandleProps" | "style" | "setNodeRef">) {
  const { demon, count } = props;
  const { tier, prestigeNum } = getPrestige(count);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: demon.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} data-testid={`card-demon-${demon.id}`}
      className={`relative flex items-center gap-3 px-2 py-3 border transition-colors ${
        isDragging ? "shadow-lg shadow-red-500/10 border-red-500/30 bg-card/95"
        : prestigeNum >= 5 ? `${tier.borderColor} ${tier.glowColor}`
        : prestigeNum >= 1 ? `${tier.borderColor} ${tier.glowColor}`
        : count >= 5 ? "border-amber-500/30 bg-amber-500/5"
        : "border-border/60 bg-card"
      }`}>
      <DemonCardInner {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </Card>
  );
}

// ===================== STAT & TRADE GRADE COMPONENTS =====================

function StatCard({ icon, label, value, subValue, testId, danger, success, small }: {
  icon: React.ReactNode; label: string; value: string | number; subValue?: string;
  testId: string; danger?: boolean; success?: boolean; small?: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card px-4 py-3" data-testid={testId}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`font-bold font-mono ${small ? "text-xs" : "text-lg"} ${danger ? "text-red-400" : success ? "text-emerald-400" : "text-foreground"} truncate`}>
        {value}
      </p>
      {subValue && <p className="text-[10px] text-muted-foreground font-mono">{subValue}</p>}
    </Card>
  );
}

const TP_OPTIONS: { value: TpQuality; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { value: "perfect", label: "Perfect", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/40" },
  { value: "too-early", label: "Early", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/40" },
  { value: "too-late", label: "Late", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/40" },
];

const SL_OPTIONS: { value: SlQuality; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { value: "perfect", label: "Perfect", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/40" },
  { value: "too-wide", label: "Wide", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/40" },
  { value: "too-narrow", label: "Narrow", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/40" },
];

function TradeGradeCard({ onLogTp, onLogSl, onUndo, gradeCount }: {
  onLogTp: (tp: TpQuality) => void; onLogSl: (sl: SlQuality) => void;
  onUndo: () => void; gradeCount: number;
}) {
  return (
    <Card className="border-border/60 bg-card p-4" data-testid="card-trade-grade">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">TP & SL Quick Log</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={gradeCount === 0}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground" data-testid="button-undo-grade">
          <Undo2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
            <Target className="w-3 h-3" /> Take Profit
          </p>
          <div className="space-y-1.5">
            {TP_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => onLogTp(opt.value)} data-testid={`tp-${opt.value}`}
                className={`w-full text-center text-xs font-medium px-3 py-2 rounded-lg border transition-all ${opt.bgColor} ${opt.borderColor} ${opt.color} hover:opacity-80 active:scale-[0.97]`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Stop Loss
          </p>
          <div className="space-y-1.5">
            {SL_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => onLogSl(opt.value)} data-testid={`sl-${opt.value}`}
                className={`w-full text-center text-xs font-medium px-3 py-2 rounded-lg border transition-all ${opt.bgColor} ${opt.borderColor} ${opt.color} hover:opacity-80 active:scale-[0.97]`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">Tap to log instantly</p>
    </Card>
  );
}

// ===================== WEEKLY REPORT OVERLAY =====================

function WeeklyReportOverlay({ weekMonday, logs, demons, onComplete }: {
  weekMonday: string;
  logs: LogEntry[];
  demons: Demon[];
  onComplete: () => void;
}) {
  const thisWeekStats = computeWeekStats(logs, demons, weekMonday);
  const top3 = thisWeekStats.slice(0, 3);

  // Previous week comparison
  const prevWeekMonday = format(subWeeks(parseISO(weekMonday), 1), "yyyy-MM-dd");
  const prevWeekStats = computeWeekStats(logs, demons, prevWeekMonday);
  const prevMap: Record<number, WeekDemonStat> = {};
  for (const s of prevWeekStats) prevMap[s.demonId] = s;

  // Combat plan inputs for top 3
  const [plans, setPlans] = useState<Record<number, string>>({});
  const allPlansWritten = top3.length > 0 && top3.every((d) => (plans[d.demonId] || "").trim().length > 0);

  const handleSubmit = () => {
    if (!allPlansWritten) return;
    const review: WeeklyReview = {
      weekStart: weekMonday,
      completedAt: new Date().toISOString(),
      top3: top3.map((d) => ({ demonId: d.demonId, hits: d.hits, cost: d.cost, score: d.score })),
      combatPlans: top3.map((d) => ({ demonId: d.demonId, plan: (plans[d.demonId] || "").trim() })),
    };
    saveWeeklyReview(review);
    onComplete();
  };

  const weekEnd = format(addDays(parseISO(weekMonday), 6), "MMM d");
  const weekStart = format(parseISO(weekMonday), "MMM d");

  // Total stats for the week
  const totalWeekLogs = logs.filter((l) => isInWeek(l.timestamp, weekMonday));
  const totalHits = totalWeekLogs.length;
  const totalCost = totalWeekLogs.reduce((sum, l) => sum + l.cost, 0);
  const prevWeekLogs = logs.filter((l) => isInWeek(l.timestamp, prevWeekMonday));
  const prevTotalHits = prevWeekLogs.length;
  const prevTotalCost = prevWeekLogs.reduce((sum, l) => sum + l.cost, 0);

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" data-testid="weekly-review-gate">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <Swords className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-1">Weekly Demon Report</h1>
          <p className="text-sm text-muted-foreground">{weekStart} — {weekEnd}</p>
          <p className="text-xs text-red-400/80 mt-2">You must write combat plans before trading this week.</p>
        </div>

        {/* Week summary stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="border-border/60 bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Hits</p>
            <p className="text-lg font-bold font-mono text-foreground">{totalHits}</p>
            <WowBadge current={totalHits} previous={prevTotalHits} lowerIsBetter />
          </Card>
          <Card className="border-border/60 bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Cost</p>
            <p className={`text-lg font-bold font-mono ${totalCost > 0 ? "text-red-400" : totalCost < 0 ? "text-emerald-400" : "text-foreground"}`}>
              {totalCost > 0 ? "-" : totalCost < 0 ? "+" : ""}${Math.abs(totalCost).toFixed(0)}
            </p>
            <WowBadge current={totalCost} previous={prevTotalCost} lowerIsBetter />
          </Card>
        </div>

        {top3.length === 0 ? (
          <Card className="border-border/60 bg-card p-6 text-center mb-6">
            <p className="text-sm text-muted-foreground">No demons logged last week. Clean week — keep it up.</p>
            <Button onClick={onComplete} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-skip-review">
              Start Trading
            </Button>
          </Card>
        ) : (
          <>
            {/* Top 3 Worst Demons */}
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top 3 Worst Demons</h2>
            <div className="space-y-4 mb-8">
              {top3.map((demon, idx) => {
                const prev = prevMap[demon.demonId];
                const hitsDiff = prev ? demon.hits - prev.hits : demon.hits;
                const costDiff = prev ? demon.cost - prev.cost : demon.cost;
                return (
                  <Card key={demon.demonId} className="border-border/60 bg-card p-4" data-testid={`weekly-demon-${demon.demonId}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-bold text-sm font-mono ${
                        idx === 0 ? "bg-red-500/20 text-red-400" : idx === 1 ? "bg-amber-500/20 text-amber-400" : "bg-yellow-500/20 text-yellow-400"
                      }`}>
                        #{idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{demon.demonName}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-mono text-muted-foreground">{demon.hits} hits</span>
                          {demon.cost !== 0 && (
                            <span className={`text-xs font-mono ${demon.cost > 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {demon.cost > 0 ? "-" : "+"}${Math.abs(demon.cost).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Week-over-week comparison bar */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hits WoW</p>
                        <WowBadge current={demon.hits} previous={prev?.hits ?? 0} lowerIsBetter />
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/30">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost WoW</p>
                        <WowBadge current={demon.cost} previous={prev?.cost ?? 0} lowerIsBetter />
                      </div>
                    </div>

                    {/* Mini bar chart: this week vs last week hits */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground w-14">Last wk</span>
                        <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-muted-foreground/30 rounded-full transition-all" style={{ width: `${Math.min(100, ((prev?.hits ?? 0) / Math.max(demon.hits, prev?.hits ?? 1)) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{prev?.hits ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-400 w-14">This wk</span>
                        <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500/70 rounded-full transition-all" style={{ width: `${Math.min(100, (demon.hits / Math.max(demon.hits, prev?.hits ?? 1)) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-red-400 w-6 text-right">{demon.hits}</span>
                      </div>
                    </div>

                    {/* Combat plan textarea */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Combat Plan</p>
                      <Textarea
                        placeholder="How will you fight this demon this week? Be specific."
                        value={plans[demon.demonId] || ""}
                        onChange={(e) => setPlans((p) => ({ ...p, [demon.demonId]: e.target.value }))}
                        className="min-h-[60px] text-sm bg-background border-border/60"
                        data-testid={`combat-plan-${demon.demonId}`}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Submit */}
            <Button onClick={handleSubmit} disabled={!allPlansWritten}
              className="w-full h-12 text-sm font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-30"
              data-testid="button-submit-weekly">
              <Swords className="w-4 h-4 mr-2" />
              {allPlansWritten ? "Submit & Start Trading" : `Write all ${top3.length} combat plans to continue`}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">You cannot trade until combat plans are submitted.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ===================== WOW BADGE =====================

function WowBadge({ current, previous, lowerIsBetter }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const diff = current - previous;
  const pctChange = previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : current > 0 ? 100 : -100;
  const isImproved = lowerIsBetter ? diff < 0 : diff > 0;
  const isWorse = lowerIsBetter ? diff > 0 : diff < 0;
  const isSame = diff === 0;

  if (isSame) return <span className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Minus className="w-3 h-3" /> No change</span>;
  return (
    <span className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${isImproved ? "text-emerald-400" : "text-red-400"}`}>
      {isImproved ? <ArrowDownIcon className="w-3 h-3" /> : <ArrowUpIcon className="w-3 h-3" />}
      {Math.abs(pctChange)}% {isImproved ? "better" : "worse"}
    </span>
  );
}

// ===================== PAST REPORTS OVERLAY =====================

function PastReportsOverlay({ logs, demons, onClose }: { logs: LogEntry[]; demons: Demon[]; onClose: () => void }) {
  const reviews = getWeeklyReviews().sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const [selectedWeek, setSelectedWeek] = useState<string | null>(reviews.length > 0 ? reviews[0].weekStart : null);

  const selected = selectedWeek ? getWeeklyReview(selectedWeek) : null;
  const weekStats = selectedWeek ? computeWeekStats(logs, demons, selectedWeek) : [];
  const prevWeekMonday = selectedWeek ? format(subWeeks(parseISO(selectedWeek), 1), "yyyy-MM-dd") : null;
  const prevWeekStats = prevWeekMonday ? computeWeekStats(logs, demons, prevWeekMonday) : [];
  const prevMap: Record<number, WeekDemonStat> = {};
  for (const s of prevWeekStats) prevMap[s.demonId] = s;

  // Build multi-week trend data for all reviewed weeks
  const weekKeys = reviews.map((r) => r.weekStart).sort();

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" data-testid="past-reports">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-bold tracking-tight">Past Reports</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-reports" className="text-xs">
            Back
          </Button>
        </div>

        {reviews.length === 0 ? (
          <Card className="border-border/60 bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">No weekly reports yet. Your first report will appear at the start of next week.</p>
          </Card>
        ) : (
          <>
            {/* Week picker */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {reviews.map((r) => {
                const ws = format(parseISO(r.weekStart), "MMM d");
                const we = format(addDays(parseISO(r.weekStart), 6), "MMM d");
                return (
                  <button key={r.weekStart} onClick={() => setSelectedWeek(r.weekStart)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedWeek === r.weekStart
                        ? "bg-red-500/15 border-red-500/30 text-red-400"
                        : "bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground"
                    }`} data-testid={`report-tab-${r.weekStart}`}>
                    {ws} — {we}
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="space-y-4">
                {/* Trend across weeks: total hits */}
                {weekKeys.length >= 2 && (
                  <Card className="border-border/60 bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3">Weekly Trend</h3>
                    <div className="space-y-2">
                      {weekKeys.map((wk) => {
                        const wkLogs = logs.filter((l) => isInWeek(l.timestamp, wk));
                        const hits = wkLogs.length;
                        const cost = wkLogs.reduce((s, l) => s + l.cost, 0);
                        const maxHits = Math.max(...weekKeys.map((w) => logs.filter((l) => isInWeek(l.timestamp, w)).length), 1);
                        const label = format(parseISO(wk), "MMM d");
                        const isSelected = wk === selectedWeek;
                        return (
                          <div key={wk} className="flex items-center gap-2">
                            <span className={`text-[10px] w-12 shrink-0 ${isSelected ? "text-red-400 font-bold" : "text-muted-foreground"}`}>{label}</span>
                            <div className="flex-1 h-4 bg-muted/30 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${isSelected ? "bg-red-500/70" : "bg-muted-foreground/30"}`}
                                style={{ width: `${(hits / maxHits) * 100}%` }} />
                            </div>
                            <span className={`text-[10px] font-mono w-8 text-right ${isSelected ? "text-red-400" : "text-muted-foreground"}`}>{hits}</span>
                            <span className={`text-[10px] font-mono w-12 text-right ${cost > 0 ? "text-red-400" : cost < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                              {cost > 0 ? "-" : cost < 0 ? "+" : ""}${Math.abs(cost).toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Top 3 with combat plans */}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Top 3 Worst & Combat Plans</h3>
                {selected.top3.map((t3, idx) => {
                  const demon = demons.find((d) => d.id === t3.demonId);
                  const plan = selected.combatPlans.find((p) => p.demonId === t3.demonId);
                  const prev = prevMap[t3.demonId];
                  return (
                    <Card key={t3.demonId} className="border-border/60 bg-card p-4" data-testid={`past-demon-${t3.demonId}`}>
                      <div className="flex items-start gap-3 mb-2">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 font-bold text-xs font-mono ${
                          idx === 0 ? "bg-red-500/20 text-red-400" : idx === 1 ? "bg-amber-500/20 text-amber-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>#{idx + 1}</div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{demon?.name ?? "Unknown"}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs font-mono text-muted-foreground">{t3.hits} hits</span>
                            {t3.cost !== 0 && (
                              <span className={`text-xs font-mono ${t3.cost > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                {t3.cost > 0 ? "-" : "+"}${Math.abs(t3.cost).toFixed(0)}
                              </span>
                            )}
                            <WowBadge current={t3.hits} previous={prev?.hits ?? 0} lowerIsBetter />
                          </div>
                        </div>
                      </div>

                      {/* Hits comparison bar */}
                      <div className="mb-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] text-muted-foreground w-12">Prev wk</span>
                          <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-muted-foreground/30 rounded-full" style={{ width: `${Math.min(100, ((prev?.hits ?? 0) / Math.max(t3.hits, prev?.hits ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">{prev?.hits ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-400 w-12">This wk</span>
                          <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500/70 rounded-full" style={{ width: `${Math.min(100, (t3.hits / Math.max(t3.hits, prev?.hits ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-red-400 w-5 text-right">{t3.hits}</span>
                        </div>
                      </div>

                      {plan && (
                        <div className="rounded-md bg-muted/20 border border-border/40 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Combat Plan</p>
                          <p className="text-xs text-foreground/90">{plan.plan}</p>
                        </div>
                      )}
                    </Card>
                  );
                })}

                <p className="text-[10px] text-muted-foreground text-center">
                  Submitted {format(parseISO(selected.completedAt), "MMM d, HH:mm")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===================== GRADE DISTRIBUTION =====================

function GradeDistribution({ grades }: { grades: TradeGrade[] }) {
  const tpGrades = grades.filter((g) => g.tp !== null);
  const slGrades = grades.filter((g) => g.sl !== null);
  if (tpGrades.length === 0 && slGrades.length === 0) return null;

  const tpTotal = tpGrades.length;
  const slTotal = slGrades.length;
  const tpPerfect = tpGrades.filter((g) => g.tp === "perfect").length;
  const tpEarly = tpGrades.filter((g) => g.tp === "too-early").length;
  const tpLate = tpGrades.filter((g) => g.tp === "too-late").length;
  const slPerfect = slGrades.filter((g) => g.sl === "perfect").length;
  const slWide = slGrades.filter((g) => g.sl === "too-wide").length;
  const slNarrow = slGrades.filter((g) => g.sl === "too-narrow").length;
  const pct = (n: number, t: number) => t > 0 ? Math.round((n / t) * 100) : 0;

  return (
    <Card className="border-border/60 bg-card p-4" data-testid="card-grade-distribution">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Quality Distribution</h3>
      </div>
      {tpTotal > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">TP</p>
            <span className="text-[10px] text-muted-foreground font-mono">{tpTotal} logged</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden mb-1">
            {tpPerfect > 0 && <div className="bg-emerald-500" style={{ width: `${pct(tpPerfect, tpTotal)}%` }} />}
            {tpEarly > 0 && <div className="bg-amber-500" style={{ width: `${pct(tpEarly, tpTotal)}%` }} />}
            {tpLate > 0 && <div className="bg-red-500" style={{ width: `${pct(tpLate, tpTotal)}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] mb-3">
            <span className="text-emerald-400">{pct(tpPerfect, tpTotal)}% perfect</span>
            <span className="text-amber-400">{pct(tpEarly, tpTotal)}% early</span>
            <span className="text-red-400">{pct(tpLate, tpTotal)}% late</span>
          </div>
        </>
      )}
      {slTotal > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">SL</p>
            <span className="text-[10px] text-muted-foreground font-mono">{slTotal} logged</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden mb-1">
            {slPerfect > 0 && <div className="bg-emerald-500" style={{ width: `${pct(slPerfect, slTotal)}%` }} />}
            {slWide > 0 && <div className="bg-amber-500" style={{ width: `${pct(slWide, slTotal)}%` }} />}
            {slNarrow > 0 && <div className="bg-red-500" style={{ width: `${pct(slNarrow, slTotal)}%` }} />}
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-emerald-400">{pct(slPerfect, slTotal)}% perfect</span>
            <span className="text-amber-400">{pct(slWide, slTotal)}% wide</span>
            <span className="text-red-400">{pct(slNarrow, slTotal)}% narrow</span>
          </div>
        </>
      )}
    </Card>
  );
}
