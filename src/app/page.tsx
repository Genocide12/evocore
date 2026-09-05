"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Code2,
  Dna,
  Gauge,
  Play,
  RotateCcw,
  ScrollText,
  Square,
  TrendingUp,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface EvolutionEvent {
  time: string;
  type: "gen" | "install" | "info" | "warn" | "error";
  msg: string;
}

interface HistoryPoint {
  generation: number;
  best: number;
  own: number;
  speedup: number;
  improved: boolean;
  champion: string;
  stagnation: number;
}

interface EvolutionState {
  running: boolean;
  generation: number;
  max_generations: number;
  population: number;
  installed_genome: { strategy: string; params: Record<string, unknown> };
  installed_code: string;
  installed_speed: number;
  baseline_speed: number;
  speedup: number;
  best_speed: number;
  best_genome: { strategy: string; params: Record<string, unknown> };
  stagnation: number;
  history: HistoryPoint[];
  events: EvolutionEvent[];
  started_at: string;
  updated_at: string;
}

interface StatusResponse {
  ok: boolean;
  running: boolean;
  state: EvolutionState | null;
  error?: string;
}

interface ChartDatum {
  gen: number;
  best: number;
  own: number;
  speedup: number;
  improved: boolean;
}

const fmtM = (v: number | undefined | null): string =>
  typeof v === "number" && isFinite(v) ? (v / 1e6).toFixed(2) + "M" : "—";

function InstallDot(props: { cx?: number; cy?: number; payload?: ChartDatum }) {
  const { cx, cy, payload } = props;
  if (typeof cx !== "number" || typeof cy !== "number" || !payload?.improved) {
    return <g />;
  }
  return (
    <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#022c22" strokeWidth={1.5} />
  );
}

function describeGenome(g: { strategy: string; params: Record<string, unknown> } | undefined): string {
  if (!g) return "—";
  const bits = Object.entries(g.params || {}).map(([k, v]) => {
    if (typeof v === "boolean") return `${k}=${v ? "on" : "off"}`;
    return `${k}=${String(v)}`;
  });
  return g.strategy + (bits.length ? " {" + bits.join(", ") + "}" : " {}");
}

const EVENT_STYLE: Record<string, string> = {
  install: "border-l-emerald-500 text-emerald-200",
  gen: "border-l-zinc-600 text-zinc-400",
  info: "border-l-zinc-700 text-zinc-400",
  warn: "border-l-amber-500 text-amber-200",
  error: "border-l-red-500 text-red-200",
};

export default function Home() {
  const { toast } = useToast();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cfgGenerations, setCfgGenerations] = useState(50);
  const [cfgPopulation, setCfgPopulation] = useState(16);
  const aliveRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/evolution/status", { cache: "no-store" });
      const json: StatusResponse = await res.json();
      if (aliveRef.current) setData(json);
    } catch {
      /* сеть могла мигнуть — следующий тик повторит */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    fetchStatus();
    const id = setInterval(fetchStatus, 1500);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [fetchStatus]);

  const doAction = useCallback(
    async (action: "start" | "stop" | "reset") => {
      if (action === "reset") {
        const ok = window.confirm(
          "Сбросить организм к наивной версии? История эволюции будет очищена.\nReset organism to naive baseline? Evolution history will be cleared."
        );
        if (!ok) return;
      }
      setBusy(action);
      try {
        const res = await fetch("/api/evolution/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            generations: cfgGenerations,
            population: cfgPopulation,
          }),
        });
        const json: { ok: boolean; error?: string; state: EvolutionState | null } =
          await res.json();
        if (!json.ok) {
          toast({
            title: "Ошибка / Error",
            description: json.error ?? "Неизвестная ошибка",
            variant: "destructive",
          });
        } else if (action === "reset") {
          toast({
            title: "Сброс выполнен / Reset done",
            description: "Организм возвращён к naive baseline",
          });
        }
        await fetchStatus();
      } catch (e) {
        toast({
          title: "Сеть недоступна / Network error",
          description: String(e),
          variant: "destructive",
        });
      } finally {
        setBusy(null);
      }
    },
    [cfgGenerations, cfgPopulation, fetchStatus, toast]
  );

  const state = data?.state ?? null;
  const running = data?.running ?? false;
  const chartData: ChartDatum[] = (state?.history ?? []).map((h) => ({
    gen: h.generation,
    best: +(h.best / 1e6).toFixed(3),
    own: +(h.own / 1e6).toFixed(3),
    speedup: h.speedup,
    improved: h.improved,
  }));
  const events = state ? [...state.events].reverse() : [];
  const genPct =
    state && state.max_generations > 0
      ? Math.min(100, (state.generation / state.max_generations) * 100)
      : 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* ---------- Header ---------- */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <Dna className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                EvoCore{" "}
                <span className="text-zinc-500">· саморазвивающаяся программа</span>
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                Генетический алгоритм эволюционирует собственный код: популяция
                мутантов проходит тесты и бенчмарк, чемпион перезаписывает файл{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs text-emerald-300">
                  genome_core.py
                </code>{" "}
                — и программа живёт дальше уже на нём.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {running ? (
              <Badge
                variant="outline"
                className="gap-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-emerald-300"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                Эволюция идёт / Running
              </Badge>
            ) : state ? (
              <Badge
                variant="outline"
                className="gap-2 border-zinc-600 bg-zinc-900 px-3 py-1.5 text-zinc-300"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                Остановлена / Stopped
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-2 border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-400"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                Не запускалась / Idle
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {/* Controls */}
        <section aria-label="Управление эволюцией" className="mb-6">
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="cfg-pop" className="text-xs text-zinc-500">
                  Популяция / Population
                </label>
                <select
                  id="cfg-pop"
                  value={cfgPopulation}
                  disabled={running || busy !== null}
                  onChange={(e) => setCfgPopulation(Number(e.target.value))}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                >
                  {[8, 12, 16, 24, 32].map((v) => (
                    <option key={v} value={v}>
                      {v} особей
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="cfg-gen" className="text-xs text-zinc-500">
                  Поколений / Max generations
                </label>
                <select
                  id="cfg-gen"
                  value={cfgGenerations}
                  disabled={running || busy !== null}
                  onChange={(e) => setCfgGenerations(Number(e.target.value))}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                >
                  {[10, 25, 50, 100].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => doAction("start")}
                disabled={running || busy !== null}
                className="min-h-11 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              >
                {busy === "start" ? (
                  <Activity className="mr-2 h-4 w-4 animate-pulse" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Старт эволюции
              </Button>
              <Button
                onClick={() => doAction("stop")}
                disabled={!running || busy !== null}
                variant="outline"
                className="min-h-11 border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100"
              >
                {busy === "stop" ? (
                  <Activity className="mr-2 h-4 w-4 animate-pulse" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                Стоп
              </Button>
              <Button
                onClick={() => doAction("reset")}
                disabled={busy !== null}
                variant="outline"
                className="min-h-11 border-amber-500/40 bg-transparent text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              >
                {busy === "reset" ? (
                  <Activity className="mr-2 h-4 w-4 animate-pulse" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Сброс к naive
              </Button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section aria-label="Метрики организма" className="mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <Dna className="h-3.5 w-3.5" aria-hidden="true" />
                  Поколение / Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-semibold text-zinc-100">
                  {state ? state.generation : "—"}
                  {state ? (
                    <span className="text-sm text-zinc-500"> / {state.max_generations}</span>
                  ) : null}
                </div>
                <Progress
                  value={genPct}
                  className="mt-3 h-1.5 bg-zinc-800 [&>div]:bg-emerald-500"
                  aria-label="Прогресс поколений"
                />
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  Лучший fitness
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-semibold text-emerald-400">
                  {fmtM(state?.best_speed)}
                  <span className="ml-1 text-xs text-zinc-500">elem/s</span>
                </div>
                <p className="mt-2 truncate text-xs text-zinc-500">
                  чемпион:{" "}
                  <span className="font-mono text-zinc-400">
                    {state ? describeGenome(state.best_genome) : "—"}
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                  Ускорение / Speedup
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-semibold text-amber-400">
                  ×{state && state.speedup ? state.speedup.toFixed(2) : "—"}
                </div>
                <p className="mt-2 truncate text-xs text-zinc-500">
                  к baseline{" "}
                  <span className="font-mono text-zinc-400">
                    {fmtM(state?.baseline_speed)} elem/s
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Метаболизм / Metabolism
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-semibold text-zinc-100">
                  {fmtM(state?.installed_speed)}
                  <span className="ml-1 text-xs text-zinc-500">elem/s</span>
                </div>
                <p className="mt-2 text-xs">
                  {state && state.stagnation >= 3 ? (
                    <span className={state.stagnation >= 8 ? "text-amber-400" : "text-zinc-500"}>
                      стагнация: {state.stagnation} покол.
                      {state.stagnation >= 8 ? " · иммиграция" : ""}
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      код живой, исполняется каждый цикл
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Chart + organism info */}
        <section aria-label="История fitness" className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-900/40 lg:col-span-2">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-medium text-zinc-300">
                  Fitness по поколениям · M elem/s
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    зелёная точка = install (код переписан)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {chartData.length > 0 ? (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="gen"
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: "#3f3f46" }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickFormatter={(v: number) => v.toFixed(1)}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#a16207"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => "×" + v.toFixed(1)}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(value) => [String(Number(value).toFixed(2)), ""]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                          formatter={(value) => <span style={{ color: "#d4d4d8" }}>{value}</span>}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="best"
                          name="Лучший fitness"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={<InstallDot />}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="own"
                          name="Организм (metabolism)"
                          stroke="#a1a1aa"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="speedup"
                          name="Speedup ×"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-600">
                    Нет данных — запустите эволюцию / No data — press Start
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-300">
                  Текущий геном / Installed genome
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state ? (
                  <>
                    <div className="rounded-lg bg-zinc-900 p-3 ring-1 ring-zinc-800">
                      <div className="font-mono text-base text-emerald-300">
                        {describeGenome(state.installed_genome)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        стратегия «горячего кода» организма
                      </div>
                    </div>
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-zinc-500">Популяция</dt>
                        <dd className="font-mono text-zinc-200">{state.population}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-zinc-500">Baseline (naive)</dt>
                        <dd className="font-mono text-zinc-200">{fmtM(state.baseline_speed)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-zinc-500">Обновлён</dt>
                        <dd className="font-mono text-zinc-200">
                          {state.updated_at
                            ? new Date(state.updated_at).toLocaleTimeString("ru-RU")
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Метаболизм — это не метрика для красоты: движок реально
                      исполняет эту функцию каждый generation, и её скорость
                      меняется после каждого install улучшенного кода.
                    </p>
                  </>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-zinc-800 px-4 text-center text-sm text-zinc-600">
                    Организм ещё не создан. Нажмите «Старт эволюции» — популяция
                    мутантов начнёт rivalry за место в genome_core.py.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Code + log */}
        <section aria-label="Код организма и журнал">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Code2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Код организма / Organism code
                  <code className="ml-auto rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                    evolution/genome_core.py
                  </code>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state?.installed_code ? (
                  <div className="max-h-[420px] overflow-y-auto rounded-lg bg-[#0d1117] ring-1 ring-zinc-800">
                    <SyntaxHighlighter
                      language="python"
                      style={oneDark}
                      showLineNumbers
                      customStyle={{
                        background: "transparent",
                        margin: 0,
                        padding: "1rem",
                        fontSize: "0.78rem",
                        lineHeight: 1.55,
                      }}
                    >
                      {state.installed_code}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-600">
                    Файл genome_core.py пуст / not initialized
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <ScrollText className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Журнал эволюции / Evolution log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length > 0 ? (
                  <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
                    {events.map((e, i) => (
                      <div
                        key={`${e.time}-${i}`}
                        className={`flex items-start gap-2 border-l-2 py-1 pl-2.5 text-xs leading-relaxed ${EVENT_STYLE[e.type] ?? EVENT_STYLE.info}`}
                      >
                        <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                          {e.time}
                        </span>
                        <span className={e.type === "gen" ? "font-mono" : ""}>{e.msg}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-600">
                    Журнал пуст — эволюция ещё не запускалась / Log is empty
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            EvoCore · саморазвитие честное: код компилируется, тестируется,
            бенчмаркается и перезаписывается на диске
          </span>
          <span className="font-mono">
            console: python3 evolution/evolution_core.py --generations 50
          </span>
        </div>
      </footer>
    </div>
  );
}
