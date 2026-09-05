"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronsRight,
  Code2,
  Coins,
  Dna,
  Dices,
  Gauge,
  Play,
  RotateCcw,
  ScrollText,
  Square,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import RaceCanvas from "@/components/arena/race-canvas";
import BetPanel from "@/components/arena/bet-panel";
import {
  computeOdds,
  familyMeta,
  fmtSpeed,
  levelInfo,
  loadBets,
  loadCoins,
  MIN_STAKE,
  saveBets,
  saveCoins,
  STARTING_COINS,
  type ArenaState,
  type BetRecord,
  type RaceResult,
} from "@/lib/arena";

const POP_OPTIONS = [8, 12, 16, 24, 32];
const GEN_OPTIONS = [20, 50, 100, 200, 500];

const LOG_COLORS: Record<string, string> = {
  install: "text-amber-300",
  gen: "text-zinc-400",
  info: "text-emerald-300",
  warn: "text-rose-300",
  error: "text-red-400",
};

export default function Home() {
  const [st, setSt] = useState<ArenaState | null>(null);
  const [running, setRunning] = useState(false);
  const [population, setPopulation] = useState(16);
  const [generations, setGenerations] = useState(50);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<RaceResult[]>([]);
  const [currentRace, setCurrentRace] = useState<RaceResult | null>(null);
  const [coins, setCoins] = useState(STARTING_COINS);
  const [pending, setPending] = useState<BetRecord | null>(null);
  const [betHistory, setBetHistory] = useState<BetRecord[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);
  const [installBanner, setInstallBanner] = useState<string | null>(null);
  const [rescues, setRescues] = useState(0);
  const lastRaceGenRef = useRef(0);
  const coinsRef = useRef(coins);
  const pendingRef = useRef(pending);
  coinsRef.current = coins;
  pendingRef.current = pending;
  const { toast } = useToast();

  useEffect(() => {
    setCoins(loadCoins());
    setBetHistory(loadBets());
  }, []);

  const odds = useMemo(() => computeOdds(st?.race_log), [st?.race_log]);
  const speedup = st?.speedup ?? 1;
  const lvl = levelInfo(speedup);
  const raceNo = st?.race_log?.length ?? 0;

  // ------------------------- опрос состояния движка -------------------------
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/evolution/status", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        running: boolean;
        state: ArenaState | null;
      };
      setRunning(data.running);
      setSt(data.state);
      const lr = data.state?.last_race;
      if (lr && lr.generation > lastRaceGenRef.current) {
        lastRaceGenRef.current = lr.generation;
        setQueue((q) => [...q, lr].slice(-6));
        // расчёт ставки по реальному результату заезда
        const p = pendingRef.current;
        if (p && lr.winner) {
          const win = lr.winner.family === p.family;
          const payout = win ? Math.round(p.stake * p.odds) : 0;
          setCoins((c) => {
            const nc = c + payout;
            saveCoins(nc);
            return nc;
          });
          const rec: BetRecord = { ...p, win };
          setBetHistory((h) => {
            const nh = [...h, rec].slice(-8);
            saveBets(nh);
            return nh;
          });
          setPending(null);
          if (win) {
            toast({
              title: `Ставка сыграла: +${Math.round(p.stake * p.odds) - p.stake} монет`,
              description: `${familyMeta(p.family).name} победили в заезде #${lr.generation}`,
            });
          } else {
            toast({
              title: `Мимо: −${p.stake} монет`,
              description: `В заезде #${lr.generation} победили ${familyMeta(lr.winner.family).name}`,
              variant: "destructive",
            });
          }
        }
        if (lr.install) {
          setInstallBanner(
            `ГЕНОМ ОБНОВЛЁН${lr.install_to ? ` → ${lr.install_to}` : ""} — организм стал быстрее`
          );
          window.setTimeout(() => setInstallBanner(null), 5000);
        }
      }
    } catch {
      /* сеть моргнула — попробуем на следующем тике */
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 1500);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ------------------------------ насос очереди ------------------------------
  useEffect(() => {
    if (!currentRace && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrentRace(next);
      setQueue(rest);
    }
  }, [currentRace, queue]);

  // -------------------------------- действия --------------------------------
  const control = useCallback(
    async (action: "start" | "stop" | "reset") => {
      setBusy(true);
      try {
        const res = await fetch("/api/evolution/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            generations,
            population,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          toast({ title: "Ошибка", description: String(data.error), variant: "destructive" });
        } else if (action === "start") {
          toast({ title: "Арена открыта!", description: "Мутанты выходят на трек" });
        } else if (action === "reset") {
          lastRaceGenRef.current = 0;
          setQueue([]);
          setCurrentRace(null);
          setSt(null);
          toast({ title: "Организм сброшен", description: "Геном возвращён к наивной версии" });
        }
        await fetchStatus();
      } finally {
        setBusy(false);
      }
    },
    [fetchStatus, generations, population, toast]
  );

  const placeBet = useCallback(
    (family: string, stake: number) => {
      if (stake < MIN_STAKE || stake > coinsRef.current || pendingRef.current) return;
      setCoins((c) => {
        const nc = c - stake;
        saveCoins(nc);
        return nc;
      });
      const rec: BetRecord = {
        generation: (st?.generation ?? 0) + 1,
        family,
        stake,
        odds: odds[family] ?? 2,
        win: null,
      };
      setPending(rec);
      toast({
        title: `Ставка: ${stake} монет на «${familyMeta(family).name}»`,
        description: `Коэффициент ×${rec.odds.toFixed(1)} · возможный выигрыш ${Math.round(stake * rec.odds)}`,
      });
    },
    [odds, st?.generation, toast]
  );

  const rescue = useCallback(() => {
    setCoins((c) => {
      const nc = c + 100;
      saveCoins(nc);
      return nc;
    });
    setRescues((r) => r + 1);
    toast({ title: "Спонсор биолаборатории ввёл +100 монет", description: "Тратить с умом!" });
  }, [toast]);

  const canStart = !running && !busy;

  // -------------------------------- разметка --------------------------------
  const events = st?.events ?? [];
  const doa = currentRace?.entries.filter((e) => !e.ok).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,#1a1a2e_0%,#09090b_55%)] text-zinc-100">
      {/* ------------------------------- шапка ------------------------------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40">
            <Dna className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black leading-tight tracking-tight">
              EvoCore <span className="text-amber-400">ARENA</span>
            </h1>
            <p className="hidden truncate text-[11px] text-zinc-500 sm:block">
              саморазвивающаяся программа · мутанты гоняются реальным кодом
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              running
                ? "animate-pulse border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 text-zinc-500"
            }
          >
            {running ? "LIVE" : "офлайн"}
          </Badge>
          <Badge variant="outline" className="hidden border-violet-500/50 bg-violet-500/10 text-violet-300 sm:inline-flex">
            <Zap className="mr-1 h-3 w-3" />
            {lvl.title}
          </Badge>
          <span
            key={coins}
            className="flex animate-in fade-in zoom-in-50 items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 font-mono text-sm font-bold text-amber-300 duration-300"
          >
            <Coins className="h-4 w-4" />
            {coins}
            {rescues > 0 && <span className="text-[10px] text-amber-500/70">+{rescues * 100}</span>}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4">
        {/* ------------------------- карточки статистики ------------------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <Activity className="h-3.5 w-3.5" /> Заезд / поколение
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-bold">
                {st?.generation ?? 0}
                <span className="text-sm text-zinc-600">/{st?.max_generations ?? "—"}</span>
              </div>
              <Progress value={st ? (st.generation / Math.max(1, st.max_generations)) * 100 : 0} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <TrendingUp className="h-3.5 w-3.5" /> Лучший мутант
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-bold text-emerald-300">
                {fmtSpeed(st?.best_speed ?? 0)}
              </div>
              <div className="truncate font-mono text-[11px] text-zinc-500">
                {st?.best_genome?.strategy ? familyMeta(st.best_genome.strategy).name : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-zinc-900/60">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-500/80">
                <Zap className="h-3.5 w-3.5" /> Сила организма
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]">
                ×{(speedup ?? 1).toFixed(2)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {lvl.title}
                {lvl.next ? ` → ${lvl.next.title} в ×${lvl.next.minSpeedup}` : " — предел пройден"}
              </div>
              <Progress value={lvl.progress} className="mt-1.5 h-1.5" />
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <Gauge className="h-3.5 w-3.5" /> Метаболизм
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-bold text-violet-300">
                {fmtSpeed(st?.installed_speed ?? 0)}
              </div>
              <div className="text-[11px] text-zinc-500">
                {st && st.stagnation >= 8 ? (
                  <span className="text-rose-300">режим иммиграции</span>
                ) : (
                  <>elem/s · текущий код живёт</>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --------------------------- арена + ставки --------------------------- */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/60 lg:col-span-2">
            {installBanner && (
              <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-top-2 bg-amber-400 py-1.5 text-center text-sm font-black text-zinc-950 duration-300">
                {installBanner}
              </div>
            )}
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Dices className="h-4 w-4 text-violet-400" />
                Трек эволюции
                {doa > 0 && (
                  <Badge variant="outline" className="border-rose-500/40 text-rose-300">
                    гейт забраковал: {doa}
                  </Badge>
                )}
              </CardTitle>
              <span className="font-mono text-[11px] text-zinc-500">
                заездов в истории: {raceNo}
                {queue.length > 0 && ` · в очереди: ${queue.length}`}
              </span>
            </CardHeader>
            <CardContent>
              <RaceCanvas
                race={currentRace}
                running={running}
                onDone={() => setCurrentRace(null)}
                onStart={() => canStart && control("start")}
                pendingFamily={pending?.family ?? null}
              />
              {/* пульт управления */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                <select
                  value={population}
                  onChange={(e) => setPopulation(Number(e.target.value))}
                  disabled={running || busy}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-300 disabled:opacity-50"
                  aria-label="Размер популяции"
                >
                  {POP_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p} мутантов
                    </option>
                  ))}
                </select>
                <select
                  value={generations}
                  onChange={(e) => setGenerations(Number(e.target.value))}
                  disabled={running || busy}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-300 disabled:opacity-50"
                  aria-label="Поколений"
                >
                  {GEN_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g} заездов
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                {running ? (
                  <Button
                    variant="outline"
                    onClick={() => control("stop")}
                    disabled={busy}
                    className="border-rose-500/50 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  >
                    <Square className="mr-1.5 h-4 w-4" /> Стоп
                  </Button>
                ) : (
                  <Button
                    onClick={() => control("start")}
                    disabled={!canStart}
                    className="bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Старт эволюции
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setResetOpen(true)}
                  disabled={busy}
                  className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Сброс
                </Button>
              </div>
            </CardContent>
          </Card>

          <BetPanel
            coins={coins}
            odds={odds}
            pending={pending}
            betHistory={betHistory}
            lastRace={st?.last_race ?? null}
            onBet={placeBet}
            onRescue={rescue}
          />
        </div>

        {/* ------------------------ код + журнал + график ------------------------ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="h-4 w-4 text-emerald-400" />
                Код организма
                <Badge variant="outline" className="font-mono text-[10px] text-zinc-500">
                  evolution/genome_core.py
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullCode((v) => !v)}
                className="h-7 text-xs text-zinc-500"
              >
                {showFullCode ? "свернуть" : "весь код"}
                <ChevronsRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className={showFullCode ? "" : "max-h-64 overflow-hidden"}>
                <div className={showFullCode ? "" : "max-h-64 overflow-y-auto"}>
                  <SyntaxHighlighter
                    language="python"
                    style={oneDark}
                    customStyle={{
                      margin: 0,
                      background: "#0c0c0f",
                      fontSize: 12,
                      borderRadius: 8,
                    }}
                    wrapLongLines={false}
                  >
                    {st?.installed_code || "# организм ещё не запускался — нажми «Старт эволюции»"}
                  </SyntaxHighlighter>
                </div>
              </div>
              {!showFullCode && (
                <p className="mt-1 text-right text-[10px] text-zinc-600">
                  этот файл программа перезаписывает себе сама
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="h-4 w-4 text-zinc-400" />
                Журнал арены
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg bg-zinc-950/70 p-3 font-mono text-[11px] leading-relaxed">
                {events.length === 0 && (
                  <p className="text-zinc-600">событий пока нет — арена ждёт старта</p>
                )}
                {events
                  .slice()
                  .reverse()
                  .slice(0, 40)
                  .map((e, i) => (
                    <p key={i} className={LOG_COLORS[e.type] ?? "text-zinc-400"}>
                      <span className="text-zinc-600">[{e.time}]</span> {e.msg}
                    </p>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Динамика силы организма</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={st?.history ?? []}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="generation" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} width={54} tickFormatter={(v: number) => fmtSpeed(v)} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number | string) => [fmtSpeed(Number(value)), ""]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="best" name="Лучший мутант" stroke="#34d399" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="own" name="Организм" stroke="#a78bfa" dot={false} strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="speedup"
                    name="Ускорение ×"
                    stroke="#fbbf24"
                    dot={
                      ((p: {
                        cx?: number;
                        cy?: number;
                        payload?: { improved?: boolean };
                      }) =>
                        p.payload?.improved && p.cx != null && p.cy != null ? (
                          <circle
                            key={`d-${p.cx}-${p.cy}`}
                            cx={p.cx}
                            cy={p.cy}
                            r={3.5}
                            fill="#fbbf24"
                            stroke="#09090b"
                            strokeWidth={1}
                          />
                        ) : null) as never
                    }
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* ------------------------------- подвал ------------------------------- */}
      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/80">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-[11px] text-zinc-600">
          EvoCore ARENA — честная эволюция: скорость бегунов это реальный бенчмарк их кода (elem/s),
          а чемпион заезда перезаписывает genome_core.py · консоль:{" "}
          <code className="text-zinc-500">python3 evolution/evolution_core.py --generations 50</code>
        </div>
      </footer>

      {/* --------------------------- диалог сброса --------------------------- */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle>Сбросить организм к naive?</DialogTitle>
            <DialogDescription>
              Геном вернётся к наивной версии, история заездов и скорость обнулятся.
              Ставки и монеты останутся у тебя.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} className="border-zinc-700">
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setResetOpen(false);
                control("reset");
              }}
            >
              Сбросить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
