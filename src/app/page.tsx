"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AwayReport, EvolutionState } from "@/lib/evolution";
import { formatAge, levelFor, translateEvent, type FeedItem } from "@/lib/pet";
import Creature from "@/components/pet/creature";
import CodeWindow from "@/components/pet/code-window";
import Confetti from "@/components/pet/confetti";
import AwayModal from "@/components/pet/away-report";

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

const LS_SEEN = "evocore_seen_v2"; // когда последний раз был пользователь
const LS_VISITED = "evocore_visited_v2"; // уже знакомы с Эво
const LS_BEST = "evocore_best_v1";

const FEED_COOLDOWN_MS = 30000; // можно кормить раз в полминуты
const FEED_JOY_MS = 12000; // сколько Эво «кушает» на экране

export default function Home() {
  const [st, setSt] = useState<EvolutionState | null>(null);
  const [alive, setAlive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [excited, setExcited] = useState(false);
  const [feeding, setFeeding] = useState(false);
  const [feedCooldown, setFeedCooldown] = useState(false);
  const [fireKey, setFireKey] = useState(0);
  const [installBanner, setInstallBanner] = useState<string | null>(null);
  const [recordBanner, setRecordBanner] = useState<string | null>(null);
  const [away, setAway] = useState<AwayReport | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  const lastCodeRef = useRef<string | null>(null);
  const prevGenRef = useRef(0);
  const bestRef = useRef(0);
  const bestInitRef = useRef(false);
  const pendingSinceRef = useRef(0); // «пока тебя не было»: живёт до первого успешного ответа

  // ─── опрос живого состояния ───
  const poll = useCallback(async () => {
    try {
      const since = pendingSinceRef.current;
      const url = since > 0 ? `/api/pet?since=${since}` : "/api/pet";
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        alive: boolean;
        state: EvolutionState | null;
        away: AwayReport | null;
      };
      if (!data.ok) return; // сервер прогружается — попробуем на следующем тике, since сохранится
      pendingSinceRef.current = 0; // ответ получен — отчёт запрошен один раз
      setAlive(data.alive);
      const s = data.state;
      if (!s) return;
      setSt(s);
      if (data.away) setAway(data.away);

      // рекордная база: личный рекорд Эво за всю жизнь + локальный
      if (!bestInitRef.current) {
        bestInitRef.current = true;
        const saved = parseFloat(localStorage.getItem(LS_BEST) ?? "0");
        bestRef.current = Math.max(saved, s.best_speedup_ever ?? 0, s.speedup);
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

      prevGenRef.current = gen;
    } catch {
      /* сеть моргнула — попробуем на следующем тике */
    }
  }, []);

  // ─── первый заход: отчёт «пока тебя не было» + метка визита ───
  useEffect(() => {
    const t0 = setTimeout(() => {
      const seen = parseInt(localStorage.getItem(LS_SEEN) ?? "0", 10) || 0;
      const visited = localStorage.getItem(LS_VISITED) === "1";
      setFirstVisit(!visited);
      localStorage.setItem(LS_VISITED, "1");
      pendingSinceRef.current = seen;
      poll();
    }, 0);
    const t = setInterval(() => poll(), 1500);

    // держим метку «последний визит» свежей: интервал + уход со страницы
    const markSeen = () => {
      try {
        localStorage.setItem(LS_SEEN, String(Date.now()));
      } catch {
        /* приватный режим — ладно */
      }
    };
    const seenTimer = setInterval(markSeen, 10000);
    const onHide = () => {
      if (document.visibilityState === "hidden") markSeen();
    };
    window.addEventListener("pagehide", markSeen);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
      clearInterval(seenTimer);
      window.removeEventListener("pagehide", markSeen);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [poll]);

  // конфетти, если пока нас не было Эво переписывал код
  useEffect(() => {
    if (away && away.rewrites > 0) {
      const t = setTimeout(() => setFireKey((k) => k + 1), 50);
      return () => clearTimeout(t);
    }
  }, [away]);

  // ─── покормить: ускорит обучение на несколько поколений ───
  const doFeed = useCallback(async () => {
    if (feedCooldown || busy) return;
    setBusy(true);
    try {
      await fetch("/api/evolution/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feed" }),
      });
      setFeeding(true);
      setFeedCooldown(true);
      setTimeout(() => setFeeding(false), FEED_JOY_MS);
      setTimeout(() => setFeedCooldown(false), FEED_COOLDOWN_MS);
      await poll();
    } finally {
      setBusy(false);
    }
  }, [feedCooldown, busy, poll]);

  // ─── новая жизнь / оживить ───
  const control = useCallback(
    async (action: "reset" | "live") => {
      setBusy(true);
      try {
        if (action === "reset") {
          lastCodeRef.current = null;
          bestRef.current = 1;
          bestInitRef.current = false;
          prevGenRef.current = 0;
          pendingSinceRef.current = 0;
          localStorage.setItem(LS_BEST, "0");
          localStorage.setItem(LS_SEEN, String(Date.now()));
        }
        await fetch("/api/evolution/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        await poll();
      } finally {
        setBusy(false);
        if (action === "reset") setConfirmReset(false);
      }
    },
    [poll]
  );

  // ─── лента «дневник» ───
  const diary: FeedItem[] = useMemo(() => {
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
  const totalGen = st?.total_generations ?? gen;
  const totalRewrites = st?.total_rewrites ?? 0;
  const fresh = totalGen === 0 && speedup <= 1.05;

  return (
    <main className="min-h-screen bg-[radial-gradient(80%_60%_at_50%_0%,#0c2a22_0%,#09090b_55%)] text-zinc-100">
      <Confetti fireKey={fireKey} />

      {/* рекорд-баннер */}
      {recordBanner && (
        <div className="evo-pop fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-2xl border border-amber-300/50 bg-amber-400/15 px-6 py-3 text-center text-lg font-extrabold text-amber-300 shadow-2xl backdrop-blur">
          🏆 {recordBanner}
        </div>
      )}

      {/* отчёт «пока тебя не было» */}
      {away && (
        <AwayModal
          report={away}
          speedupNow={st?.speedup ?? 1}
          onClose={() => setAway(null)}
        />
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
                alive ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {alive ? "живу 24/7 💫" : "перезапуск… 💤"}
            </div>
          </div>
          <p className="text-sm text-zinc-400">Я программирую сам себя и расту!</p>
          <p className="mb-2 text-xs text-zinc-500">
            мне {formatAge(st?.born_at)} · поколений прожито: <b className="tabular-nums text-zinc-400">{totalGen}</b>
          </p>

          <Creature speedup={speedup} running={alive} excited={excited} feeding={feeding} />

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
            {alive ? (
              <>
                Сейчас идёт поколение <b className="text-emerald-300">{gen}</b> — я тренируюсь…
              </>
            ) : (
              <>Просыпаюсь… сторож перезапустит меня через несколько секунд 💤</>
            )}
          </div>

          {/* кормёжка */}
          <button
            onClick={doFeed}
            disabled={busy || feedCooldown}
            className={`mt-5 w-full rounded-2xl py-4 text-xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-60 ${
              feeding
                ? "bg-gradient-to-r from-amber-400 to-orange-300 text-amber-950"
                : "bg-gradient-to-r from-emerald-500 to-lime-400 text-emerald-950 hover:brightness-110"
            }`}
          >
            {feeding ? "🍎 ням-ням! расту быстрее…" : feedCooldown ? "🙂 спасибо, я сыт!" : "🍎 Покормить витаминами"}
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
            Витамины ускоряют мои уроки. Но даже без них я живу и учусь на сервере
            круглосуточно — закрой сайт и вернись позже!
          </p>

          {/* новая жизнь */}
          <div className="mt-3 text-center">
            {confirmReset ? (
              <button
                onClick={() => control("reset")}
                disabled={busy}
                className="rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25"
              >
                Точно начать новую жизнь с яичка?
              </button>
            ) : (
              <button
                onClick={() => {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 4000);
                }}
                className="rounded-full px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-400"
              >
                🔄 Новая жизнь
              </button>
            )}
          </div>
        </section>

        {/* ══════════ правая колонка: код и дневник ══════════ */}
        <section className="mt-8 space-y-4 lg:mt-0">
          {/* приветствие новичку */}
          {fresh && firstVisit && !away && (
            <div className="evo-pop rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm leading-relaxed text-emerald-100">
              <b>Привет! Я Эво 🥚</b> — тамагочи, сотканное из кода.
              <br />
              Я живу на сервере и никогда не сплю: сам пишу себе новый код, пробую его,
              выбрасываю неудачные версии и становлюсь быстрее. <b className="text-emerald-300">Закрой сайт
              и вернись позже</b> — я расскажу, что успел сделать без тебя!
            </div>
          )}

          {/* баннер установки */}
          {installBanner && (
            <div className="evo-pop rounded-2xl border border-amber-300/50 bg-gradient-to-r from-amber-400/20 to-yellow-300/10 p-3.5 text-center text-base font-extrabold text-amber-200 shadow-lg">
              ✍️ {installBanner}
            </div>
          )}

          {alive && (
            <div className="animate-pulse text-center text-sm text-zinc-400">
              💭 думаю, пробую новые варианты кода…
            </div>
          )}

          <CodeWindow code={st?.installed_code ?? ""} running={alive} rewrites={totalRewrites} />

          {/* дневник */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h2 className="mb-2.5 text-sm font-bold text-zinc-300">📖 Дневник Эво</h2>
            {diary.length === 0 ? (
              <p className="text-sm text-zinc-500">Пока пусто — я только проснулся. Скоро здесь появятся мои победы!</p>
            ) : (
              <ul className="space-y-2">
                {diary.map((f) => (
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
