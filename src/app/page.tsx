"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvolutionState } from "@/lib/evolution";
import { levelFor, translateEvent, type FeedItem } from "@/lib/pet";
import Creature from "@/components/pet/creature";
import CodeWindow from "@/components/pet/code-window";
import Confetti from "@/components/pet/confetti";

// ─── плавный счётчик чисел ───
function useCountUp(target: number, dur = 800): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (Math.abs(target - from) < 0.0005) {
      setVal(target);
      fromRef.current = target;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  useEffect(() => {
    fromRef.current = val;
  }, [val]);
  return val;
}

const LS_BEST = "evocore_best_v1";
const LS_REWRITES = "evocore_rewrites_v1";
const LS_AUTO = "evocore_auto_v1";

export default function Home() {
  const [st, setSt] = useState<EvolutionState | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [excited, setExcited] = useState(false);
  const [fireKey, setFireKey] = useState(0);
  const [installBanner, setInstallBanner] = useState<string | null>(null);
  const [recordBanner, setRecordBanner] = useState<string | null>(null);
  const [rewrites, setRewrites] = useState(0);
  const [auto, setAuto] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  const lastCodeRef = useRef<string | null>(null);
  const prevGenRef = useRef(0);
  const prevRunningRef = useRef(false);
  const bestRef = useRef(0);
  const bestInitRef = useRef(false);
  const userStoppedRef = useRef(false);
  const autoBusyRef = useRef(false);
  const autoRef = useRef(auto);

  // ─── стартовое состояние из localStorage ───
  useEffect(() => {
    const t = setTimeout(() => {
      setRewrites(parseInt(localStorage.getItem(LS_REWRITES) ?? "0", 10) || 0);
      setAuto(localStorage.getItem(LS_AUTO) !== "0");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // синхронизация авто-режима для колбэков
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  // ─── опрос состояния ───
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/evolution/status", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; running: boolean; state: EvolutionState | null };
      setRunning(data.running);
      const s = data.state;
      if (!s) return;
      setSt(s);

      // рекордная база: не празднуем чужие прошлые рекорды при первом заходе
      if (!bestInitRef.current) {
        bestInitRef.current = true;
        const saved = parseFloat(localStorage.getItem(LS_BEST) ?? "0");
        bestRef.current = Math.max(saved, s.speedup);
      }

      const gen = s.generation;

      // Эво переписал свой код
      if (s.installed_code && lastCodeRef.current !== null && s.installed_code !== lastCodeRef.current && gen > prevGenRef.current) {
        const inst = [...s.events].reverse().find((e) => e.msg.startsWith("INSTALL"));
        const m = inst?.msg.match(/verified \+?(\d+(?:\.\d+)?)%/);
        setInstallBanner(m ? `Я переписал свой код! Стал быстрее на +${m[1]}%` : "Я переписал свой код!");
        setExcited(true);
        setTimeout(() => setExcited(false), 2600);
        setTimeout(() => setInstallBanner(null), 6000);
        setRewrites((r) => {
          const nr = r + 1;
          localStorage.setItem(LS_REWRITES, String(nr));
          return nr;
        });
        // рекорд силы празднуем ТОЛЬКО при реальном переписывании кода (не на шуме замеров)
        if (s.speedup > bestRef.current + 0.001 && s.speedup > 1.01) {
          bestRef.current = s.speedup;
          localStorage.setItem(LS_BEST, String(s.speedup));
          setRecordBanner(`НОВЫЙ РЕКОРД! Сила ×${s.speedup.toFixed(2)}`);
          setFireKey((k) => k + 1);
          setTimeout(() => setRecordBanner(null), 5000);
        }
      }
      if (s.installed_code) lastCodeRef.current = s.installed_code;

      // автопродолжение: урок кончился — Эво начинает новый сам
      if (
        prevRunningRef.current &&
        !data.running &&
        autoRef.current &&
        !userStoppedRef.current &&
        gen > 0 &&
        s.max_generations > 0 &&
        gen >= s.max_generations &&
        !autoBusyRef.current
      ) {
        autoBusyRef.current = true;
        setTimeout(async () => {
          try {
            await fetch("/api/evolution/control", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "start", generations: 200, population: 16 }),
            });
          } catch {
            /* ignore */
          } finally {
            setTimeout(() => (autoBusyRef.current = false), 4000);
          }
        }, 1500);
      }

      prevGenRef.current = gen;
      prevRunningRef.current = data.running;
    } catch {
      /* сеть моргнула — попробуем на следующем тике */
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(poll, 0);
    const t = setInterval(poll, 1200);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [poll]);

  // ─── кнопки ───
  const control = useCallback(async (action: "start" | "stop" | "reset") => {
    setBusy(true);
    try {
      if (action === "start") {
        userStoppedRef.current = false;
      } else if (action === "stop") {
        userStoppedRef.current = true;
      } else {
        userStoppedRef.current = true;
        lastCodeRef.current = null;
        bestRef.current = 1;
        bestInitRef.current = false;
        localStorage.setItem(LS_BEST, "0");
        localStorage.setItem(LS_REWRITES, "0");
        setRewrites(0);
      }
      await fetch("/api/evolution/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, generations: 200, population: 16 }),
      });
      await poll();
    } finally {
      setBusy(false);
      if (action === "reset") setConfirmReset(false);
    }
  }, [poll]);

  // ─── лента «дневник» ───
  const feed: FeedItem[] = useMemo(() => {
    const ev = st?.events ?? [];
    const out: FeedItem[] = [];
    for (let i = ev.length - 1; i >= 0 && out.length < 12; i--) {
      const item = translateEvent(ev[i]);
      if (item) out.push(item);
    }
    return out;
  }, [st?.events, st?.generation]);

  const speedup = st?.speedup ?? 1;
  const shown = useCountUp(speedup);
  const { level, next, progress } = levelFor(speedup);
  const gen = st?.generation ?? 0;
  const maxGen = st?.max_generations ?? 0;
  const fresh = gen === 0 && !running && speedup <= 1.05;

  return (
    <main className="min-h-screen bg-[radial-gradient(80%_60%_at_50%_0%,#0c2a22_0%,#09090b_55%)] text-zinc-100">
      <Confetti fireKey={fireKey} />

      {/* рекорд-баннер */}
      {recordBanner && (
        <div className="evo-pop fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-2xl border border-amber-300/50 bg-amber-400/15 px-6 py-3 text-center text-lg font-extrabold text-amber-300 shadow-2xl backdrop-blur">
          🏆 {recordBanner}
        </div>
      )}

      <div className="mx-auto max-w-md px-4 pb-16 pt-6 lg:grid lg:max-w-5xl lg:grid-cols-[380px_1fr] lg:gap-10">
        {/* ══════════ левая колонка: существо и сила ══════════ */}
        <section className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-tight">
              Эво <span className="align-middle text-base">🧬</span>
            </h1>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                running ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {running ? "учится 💫" : gen > 0 ? "отдыхает 😴" : "ждёт 🥚"}
            </div>
          </div>
          <p className="mb-2 text-sm text-zinc-400">Я программирую сам себя и расту!</p>

          <Creature speedup={speedup} running={running} excited={excited} />

          {/* Сила */}
          <div className="mt-2 text-center">
            <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">моя сила</div>
            <div className="bg-gradient-to-b from-emerald-200 to-emerald-500 bg-clip-text text-6xl font-black text-transparent tabular-nums transition-all">
              ×{shown.toFixed(2)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm font-bold text-emerald-300">
              {level.emoji} {level.name}
            </div>
          </div>

          {/* прогресс до следующего уровня */}
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300 transition-all duration-700"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 text-center text-xs text-zinc-400">
              {next ? (
                <>
                  до {next.emoji} <b className="text-zinc-200">{next.name}</b> осталось ещё ×{(next.min - speedup).toFixed(2)} силы
                </>
              ) : (
                <>это максимальный уровень! 🐉</>
              )}
            </div>
          </div>

          {/* поколение */}
          <div className="mt-3 text-center text-xs text-zinc-500">
            {running ? (
              <>
                Поколение <b className="text-emerald-300">{gen}</b>
                {maxGen > 0 && <> из {maxGen}</>} — тренируюсь…
              </>
            ) : (
              <>Пройдено поколений: {gen}</>
            )}
          </div>

          {/* главная кнопка */}
          <button
            onClick={() => control(running ? "stop" : "start")}
            disabled={busy}
            className={`mt-5 w-full rounded-2xl py-4 text-xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-60 ${
              running
                ? "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "bg-gradient-to-r from-emerald-500 to-lime-400 text-emerald-950 hover:brightness-110"
            }`}
          >
            {running ? "⏸ Стоп" : fresh ? "🚀 Расти!" : "▶ Расти ещё!"}
          </button>

          {/* бесконечный рост + сброс */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              onClick={() => {
                const nv = !auto;
                setAuto(nv);
                localStorage.setItem(LS_AUTO, nv ? "1" : "0");
              }}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                auto ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              🔄 Авто-рост: {auto ? "вкл" : "выкл"}
            </button>
            {confirmReset ? (
              <button
                onClick={() => control("reset")}
                disabled={busy}
                className="rounded-full bg-rose-500/15 px-3 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/25"
              >
                Точно начать с яйца?
              </button>
            ) : (
              <button
                onClick={() => {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 4000);
                }}
                className="rounded-full px-3 py-1.5 text-zinc-500 hover:text-zinc-300"
              >
                Сбросить
              </button>
            )}
          </div>
        </section>

        {/* ══════════ правая колонка: код и дневник ══════════ */}
        <section className="mt-8 space-y-4 lg:mt-0">
          {/* приветствие для новичка */}
          {fresh && (
            <div className="evo-pop rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm leading-relaxed text-emerald-100">
              <b>Привет! Я Эво 🥚</b> — существо, сотканное из кода.
              <br />
              Нажми <b className="text-emerald-300">«Расти!»</b> — и я сам буду писать себе новый код, пробовать его,
              выбрасывать неудачные версии и становиться быстрее. Прямо у тебя на глазах!
            </div>
          )}

          {/* баннер установки */}
          {installBanner && (
            <div className="evo-pop rounded-2xl border border-amber-300/50 bg-gradient-to-r from-amber-400/20 to-yellow-300/10 p-3.5 text-center text-base font-extrabold text-amber-200 shadow-lg">
              ✍️ {installBanner}
            </div>
          )}

          {running && (
            <div className="animate-pulse text-center text-sm text-zinc-400">
              💭 думаю, пробую новые варианты кода…
            </div>
          )}

          <CodeWindow code={st?.installed_code ?? ""} running={running} rewrites={rewrites} />

          {/* дневник */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h2 className="mb-2.5 text-sm font-bold text-zinc-300">📖 Дневник Эво</h2>
            {feed.length === 0 ? (
              <p className="text-sm text-zinc-500">Пока пусто. Нажми «Расти!» — и здесь появится история моих побед!</p>
            ) : (
              <ul className="space-y-2">
                {feed.map((f) => (
                  <li
                    key={`${f.time}-${f.id}`}
                    className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm leading-snug ${
                      f.tone === "win"
                        ? "bg-emerald-500/10 text-emerald-100"
                        : f.tone === "warn"
                          ? "bg-sky-500/10 text-sky-100"
                          : "bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    <span className="mt-0.5 text-base leading-none">{f.emoji}</span>
                    <span className="flex-1">{f.text}</span>
                    <span className="mt-0.5 shrink-0 text-[10px] text-zinc-500">{f.time}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="px-1 text-center text-[11px] leading-relaxed text-zinc-600">
            Это не мультфильм: Эво — настоящий генетический алгоритм. Код на экране — реальный файл
            <span className="text-zinc-400"> genome_core.py</span>, который программа перезаписывает, когда находит
            более быструю версию. Всё честно — попробуй на{" "}
            <a href="https://github.com/Genocide12/evocore" target="_blank" rel="noreferrer" className="underline hover:text-zinc-400">
              GitHub
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
