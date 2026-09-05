"use client";

import type { EvolutionState } from "@/lib/evolution";

// ------------------------- Типы гонки (данные движка) -------------------------

export interface RaceEntry {
  id: string;
  label: string; // describe(genome), напр. "direct{inline=on}"
  family: string; // стратегия: naive | pow_cache | horner | direct | unroll
  ok: boolean;
  speed: number; // elem/s (0 — если мутант отбракован)
  rank: number | null; // место среди выживших, 1 — победитель
  error: string | null;
}

export interface RaceResult {
  generation: number;
  entries: RaceEntry[];
  winner: { label: string; family: string; speed: number } | null;
  install: boolean;
  install_to?: string;
}

export interface RaceLogEntry {
  generation: number;
  winner: string | null;
  install: boolean;
}

export interface ArenaState extends EvolutionState {
  last_race?: RaceResult | null;
  race_log?: RaceLogEntry[];
}

// ----------------------------- Семейства стратегий -----------------------------

export interface FamilyMeta {
  key: string;
  name: string;
  hint: string;
  color: string; // hex для canvas
  chip: string; // tailwind-классы для UI
  shape: "circle" | "diamond" | "triangle" | "bolt" | "star";
}

export const FAMILIES: Record<string, FamilyMeta> = {
  naive: {
    key: "naive",
    name: "Наивные",
    hint: "x**i в цикле — медленно, но живуче",
    color: "#94a3b8",
    chip: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    shape: "circle",
  },
  pow_cache: {
    key: "pow_cache",
    name: "Степенные",
    hint: "копят степень в цикле",
    color: "#2dd4bf",
    chip: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    shape: "diamond",
  },
  horner: {
    key: "horner",
    name: "Горнер",
    hint: "схема Горнера по коэффициентам",
    color: "#a78bfa",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    shape: "triangle",
  },
  direct: {
    key: "direct",
    name: "Прямые",
    hint: "развёрнутый Горнер, инлайнят константы",
    color: "#34d399",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    shape: "bolt",
  },
  unroll: {
    key: "unroll",
    name: "Размотка",
    hint: "loop unrolling по несколько элементов",
    color: "#fbbf24",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    shape: "star",
  },
};

export const familyMeta = (key: string): FamilyMeta =>
  FAMILIES[key] ?? FAMILIES.naive;

// --------------------------------- Уровни организма ---------------------------------

export interface LevelDef {
  minSpeedup: number;
  title: string;
}

export const LEVELS: LevelDef[] = [
  { minSpeedup: 0, title: "Прокариот" },
  { minSpeedup: 1.25, title: "Микроб" },
  { minSpeedup: 1.75, title: "Амёба" },
  { minSpeedup: 2.5, title: "Жгутиконосец" },
  { minSpeedup: 3.25, title: "Хищник" },
  { minSpeedup: 4.25, title: "Альфа-мутант" },
  { minSpeedup: 5, title: "Легенда арены" },
];

export function levelInfo(speedup: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (speedup >= LEVELS[i].minSpeedup) idx = i;
  }
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progress = next
    ? Math.min(
        100,
        Math.max(
          0,
          ((speedup - cur.minSpeedup) / (next.minSpeedup - cur.minSpeedup)) * 100
        )
      )
    : 100;
  return { idx, title: cur.title, next, progress };
}

// ------------------------------- Коэффициенты ставок -------------------------------
// Считаются по реальному журналу побед движка (race_log) со сглаживанием Лапласа
// и «маржой арены» 10%: odds = 0.90 / вероятность победы семейства.

export const FAMILY_KEYS = ["naive", "pow_cache", "horner", "direct", "unroll"];

export function computeOdds(raceLog: RaceLogEntry[] | undefined): Record<string, number> {
  const log = raceLog ?? [];
  const total = log.length;
  const odds: Record<string, number> = {};
  for (const f of FAMILY_KEYS) {
    const wins = log.filter((r) => r.winner === f).length;
    const p = (wins + 1) / (total + FAMILY_KEYS.length);
    const raw = 0.9 / p;
    odds[f] = Math.round(Math.min(12, Math.max(1.1, raw)) * 10) / 10;
  }
  return odds;
}

// ---------------------------------- Банк игрока ----------------------------------

export const STARTING_COINS = 100;
export const MIN_STAKE = 10;
const COINS_KEY = "evocore_arena_coins";
const BETS_KEY = "evocore_arena_bets";

export interface BetRecord {
  generation: number; // поколение ставки
  family: string;
  stake: number;
  odds: number;
  win: boolean | null; // null — ставка ещё не разыграна
}

export function loadCoins(): number {
  if (typeof window === "undefined") return STARTING_COINS;
  const raw = window.localStorage.getItem(COINS_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : STARTING_COINS;
}

export function saveCoins(coins: number) {
  try {
    window.localStorage.setItem(COINS_KEY, String(coins));
  } catch {}
}

export function loadBets(): BetRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BETS_KEY);
    const arr = raw ? (JSON.parse(raw) as BetRecord[]) : [];
    return Array.isArray(arr) ? arr.slice(-8) : [];
  } catch {
    return [];
  }
}

export function saveBets(bets: BetRecord[]) {
  try {
    window.localStorage.setItem(BETS_KEY, JSON.stringify(bets.slice(-8)));
  } catch {}
}

// ------------------------------------ Утилиты ------------------------------------

export function fmtSpeed(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}
