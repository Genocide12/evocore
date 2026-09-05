"use client";

import { useState } from "react";
import { Coins, HandCoins, LifeBuoy, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  familyMeta,
  FAMILY_KEYS,
  fmtSpeed,
  MIN_STAKE,
  type BetRecord,
  type RaceResult,
} from "@/lib/arena";

interface BetPanelProps {
  coins: number;
  odds: Record<string, number>;
  pending: BetRecord | null;
  betHistory: BetRecord[];
  lastRace: RaceResult | null;
  onBet: (family: string, stake: number) => void;
  onRescue: () => void;
}

const STAKES = [10, 25, 50, 100];

export default function BetPanel({
  coins,
  odds,
  pending,
  betHistory,
  lastRace,
  onBet,
  onRescue,
}: BetPanelProps) {
  const [stake, setStake] = useState<number>(25);
  const effStake = Math.min(stake, coins);
  const canBet = coins >= MIN_STAKE && !pending;
  const allIn = coins > 0 && effStake === coins;

  const settled = betHistory.filter((b) => b.win !== null);
  const wins = settled.filter((b) => b.win).length;

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-amber-400" />
            Тотализатор
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-sm font-bold text-amber-300">
            <Coins className="h-3.5 w-3.5" />
            {coins}
          </span>
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Поставь на семейство — угадаешь победителя ближайшего заезда, заберёшь банк.
          Коэффициенты считаются по реальной статистике побед.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* выбор ставки */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Ставка:</span>
          {STAKES.map((s) => (
            <button
              key={s}
              disabled={!canBet || coins < s}
              onClick={() => setStake(s)}
              className={`rounded-md border px-2.5 py-1 font-mono text-xs transition disabled:opacity-35 ${
                stake === s && !allIn
                  ? "border-amber-400 bg-amber-500/15 text-amber-300"
                  : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            disabled={!canBet || coins <= 0}
            onClick={() => setStake(coins)}
            className={`rounded-md border px-2.5 py-1 text-xs font-bold transition disabled:opacity-35 ${
              allIn
                ? "border-rose-400 bg-rose-500/15 text-rose-300"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-rose-500/60"
            }`}
          >
            ВСЁ
          </button>
        </div>

        {/* семейства */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {FAMILY_KEYS.map((f) => {
            const meta = familyMeta(f);
            const o = odds[f] ?? 2;
            const isPending = pending?.family === f;
            return (
              <button
                key={f}
                disabled={!canBet || effStake <= 0}
                onClick={() => onBet(f, effStake)}
                title={meta.hint}
                className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPending
                    ? "border-amber-400/70 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/70"
                }`}
              >
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-semibold"
                    style={{ color: meta.color }}
                  >
                    {meta.name}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-zinc-500">
                    {meta.hint}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold text-amber-300">
                    ×{o.toFixed(1)}
                  </span>
                  <span className="block font-mono text-[10px] text-zinc-500">
                    → {Math.round(effStake * o)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* статус ставки */}
        {pending ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            Ставка принята:{" "}
            <b className="font-mono">{familyMeta(pending.family).name}</b> ·{" "}
            {pending.stake} монет × {pending.odds.toFixed(1)} — ждём ближайший
            заезд...
          </div>
        ) : coins < MIN_STAKE ? (
          <Button
            onClick={onRescue}
            variant="outline"
            className="w-full border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
          >
            <LifeBuoy className="mr-2 h-4 w-4" />
            Банкрот! Спонсор даёт +100 монет
          </Button>
        ) : (
          <p className="text-center text-[11px] text-zinc-600">
            Выбери семейство, чтобы сделать ставку
          </p>
        )}

        {/* история */}
        {settled.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Последние ставки</span>
              <span className="font-mono">
                {wins}/{settled.length} ·{" "}
                {betHistory
                  .filter((b) => b.win !== null)
                  .reduce((acc, b) => acc + (b.win ? Math.round(b.stake * b.odds) - b.stake : -b.stake), 0) >= 0
                  ? "+"
                  : ""}
                {
                  betHistory
                    .filter((b) => b.win !== null)
                    .reduce((acc, b) => acc + (b.win ? Math.round(b.stake * b.odds) - b.stake : -b.stake), 0)
                }
              </span>
            </div>
            {betHistory
              .slice()
              .reverse()
              .slice(0, 5)
              .map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-zinc-900 px-2 py-1 text-[11px]"
                >
                  <span className="font-mono text-zinc-400">
                    заезд #{b.generation} · {familyMeta(b.family).name}
                  </span>
                  {b.win === null ? (
                    <Badge variant="outline" className="text-zinc-500">
                      в игре
                    </Badge>
                  ) : b.win ? (
                    <span className="font-mono font-bold text-emerald-400">
                      +{Math.round(b.stake * b.odds) - b.stake}
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-rose-400">
                      −{b.stake}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* итог прошлого заезда */}
        {lastRace?.winner && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400">
            <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate">
              Заезд #{lastRace.generation}:{" "}
              <b style={{ color: familyMeta(lastRace.winner.family).color }}>
                {familyMeta(lastRace.winner.family).name}
              </b>{" "}
              <span className="font-mono">
                ({lastRace.winner.label}) · {fmtSpeed(lastRace.winner.speed)} elem/s
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
