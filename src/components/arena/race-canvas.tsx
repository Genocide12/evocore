"use client";

import { useEffect, useRef } from "react";
import { familyMeta, fmtSpeed, type RaceResult } from "@/lib/arena";

const RUN_MS = 4600; // длительность заезда
const PODIUM_MS = 1700; // показ подиума
const COUNTDOWN_MS = 900;
const MAX_LANES = 14;

type Phase = "idle" | "countdown" | "run" | "podium";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface RaceCanvasProps {
  race: RaceResult | null;
  running: boolean;
  onDone: () => void;
  onStart: () => void;
  pendingFamily?: string | null;
}

function drawCheckered(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const cell = Math.max(4, Math.min(8, h / 10));
  for (let cy = 0; cy < h; cy += cell) {
    for (let cx = 0; cx < w; cx += cell) {
      const dark = (Math.floor(cy / cell) + Math.floor(cx / cell)) % 2 === 0;
      ctx.fillStyle = dark ? "rgba(255,255,255,0.75)" : "rgba(20,20,24,0.9)";
      ctx.fillRect(x + cx, y + cy, Math.min(cell, w - cx), Math.min(cell, h - cy));
    }
  }
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

export default function RaceCanvas({
  race,
  running,
  onDone,
  onStart,
  pendingFamily,
}: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const phaseStartRef = useRef(0);
  const raceRef = useRef<RaceResult | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // смена заезда → старт обратного отсчёта
  useEffect(() => {
    if (race) {
      raceRef.current = race;
      phaseRef.current = "countdown";
      phaseStartRef.current = performance.now();
      particlesRef.current = [];
    } else {
      raceRef.current = null;
      phaseRef.current = "idle";
    }
  }, [race]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = wrap.getBoundingClientRect();
      W = Math.max(320, rect.width);
      H = Math.max(360, Math.min(560, rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const finishTimes = (entries: RaceResult["entries"]) => {
      const okEntries = entries.filter((e) => e.ok && e.rank);
      const n = Math.max(1, okEntries.length);
      const map = new Map<string, number>();
      for (const e of okEntries) {
        const norm = n === 1 ? 0 : ((e.rank ?? 1) - 1) / (n - 1);
        map.set(e.id, RUN_MS * (0.55 + 0.45 * norm));
      }
      return map;
    };

    const spawnParticles = (x: number, y: number, color: string) => {
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 1.5 + Math.random() * 4.5;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 1.5,
          life: 0,
          maxLife: 600 + Math.random() * 700,
          color,
          size: 1.5 + Math.random() * 2.5,
        });
      }
    };

    const drawIdle = (t: number) => {
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, W, H);
      // дрейфующие «гены»
      for (let i = 0; i < 26; i++) {
        const x = ((i * 137.5 + t * 0.02 * (1 + (i % 3))) % (W + 40)) - 20;
        const y =
          H / 2 +
          Math.sin(t * 0.0012 + i * 1.7) * (H * 0.32) +
          Math.cos(t * 0.0009 + i) * 14;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = i % 5 === 0 ? "#fbbf2455" : "#34d39933";
        ctx.fill();
      }
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.004);
      ctx.textAlign = "center";
      ctx.font = "700 26px ui-sans-serif, system-ui";
      ctx.fillStyle = `rgba(52, 211, 153, ${pulse})`;
      ctx.fillText("АРЕНА ОЖИДАЕТ ОРГАНИЗМ", W / 2, H / 2 - 10);
      ctx.font = "500 14px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(228, 228, 231, 0.65)";
      ctx.fillText(
        'нажми «Старт эволюции» — мутанты выйдут на трек',
        W / 2,
        H / 2 + 20
      );
    };

    const draw = () => {
      const t = performance.now();
      const phase = phaseRef.current;
      const r = raceRef.current;

      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, W, H);

      if (!r || phase === "idle") {
        drawIdle(t);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const elapsed = t - phaseStartRef.current;

      if (phase === "countdown" && elapsed >= COUNTDOWN_MS) {
        phaseRef.current = "run";
        phaseStartRef.current = t;
      } else if (phase === "run" && elapsed >= RUN_MS) {
        phaseRef.current = "podium";
        phaseStartRef.current = t;
      } else if (phase === "podium" && elapsed >= PODIUM_MS) {
        const cb = onDoneRef.current;
        phaseRef.current = "idle";
        raceRef.current = null;
        cb();
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const entries = r.entries;
      const shown = entries.slice(0, MAX_LANES);
      const fts = finishTimes(entries);
      const runT = Math.max(0, Math.min(RUN_MS, elapsed));
      const laneH = Math.min(34, (H - 90) / Math.max(1, shown.length));
      const top = 56;
      const x0 = 14;
      const x1 = W - 90;

      // заголовок заезда
      ctx.textAlign = "left";
      ctx.font = "700 15px ui-sans-serif, system-ui";
      ctx.fillStyle = "#fafafa";
      const label =
        phase === "countdown"
          ? `ЗАЕЗД №${r.generation} — старт...`
          : phase === "run"
            ? `ЗАЕЗД №${r.generation}`
            : `ЗАЕЗД №${r.generation} — финиш`;
      ctx.fillText(label, 14, 26);
      ctx.font = "500 12px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(161,161,170,0.8)";
      const doaCount = entries.filter((e) => !e.ok).length;
      ctx.fillText(
        `${entries.length} мутантов · живых: ${entries.length - doaCount}` +
          (doaCount ? ` · отбраковано гейтом: ${doaCount}` : ""),
        14,
        44
      );

      // треки
      for (let i = 0; i < shown.length; i++) {
        const y = top + i * laneH;
        ctx.strokeStyle = "rgba(63,63,70,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y + laneH - 5);
        ctx.lineTo(x1, y + laneH - 5);
        ctx.stroke();
      }
      drawCheckered(ctx, x1 + 2, top - 4, 8, shown.length * laneH);

      if (phase === "podium") {
        // подиум
        const okSorted = entries
          .filter((e) => e.ok && e.rank)
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
          .slice(0, 3);
        const medals = ["#fbbf24", "#d4d4d8", "#b45309"];
        ctx.textAlign = "center";
        okSorted.forEach((e, i) => {
          const cx = W / 2 + (i === 0 ? 0 : i === 1 ? -150 : 150);
          const cy = H / 2 - 6 + (i === 0 ? 0 : 14);
          const meta = familyMeta(e.family);
          ctx.beginPath();
          ctx.arc(cx, cy, 26, 0, Math.PI * 2);
          ctx.fillStyle = meta.color + "26";
          ctx.fill();
          ctx.strokeStyle = medals[i];
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.font = "700 16px ui-sans-serif, system-ui";
          ctx.fillStyle = medals[i];
          ctx.fillText(String(i + 1), cx, cy - 34);
          ctx.font = "600 12px ui-monospace, monospace";
          ctx.fillStyle = meta.color;
          ctx.fillText(e.label, cx, cy + 4);
          ctx.font = "500 11px ui-sans-serif, system-ui";
          ctx.fillStyle = "rgba(212,212,216,0.85)";
          ctx.fillText(fmtSpeed(e.speed) + " elem/s", cx, cy + 20);
        });

        if (r.install) {
          ctx.font = "800 20px ui-sans-serif, system-ui";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText(
            "ГЕНОМ ОБНОВЛЁН" + (r.install_to ? ` → ${r.install_to}` : ""),
            W / 2,
            30
          );
          // частицы
          if (particlesRef.current.length === 0) {
            spawnParticles(W / 2, H / 2 - 40, "#fbbf24");
            spawnParticles(W / 2, H / 2 - 40, "#34d399");
          }
        }
      } else if (phase === "countdown") {
        const frac = elapsed / COUNTDOWN_MS;
        ctx.textAlign = "center";
        ctx.font = "800 44px ui-sans-serif, system-ui";
        ctx.fillStyle = `rgba(250,250,250,${0.9 - frac * 0.6})`;
        ctx.fillText("3… 2… 1…", W / 2, H / 2);
      } else {
        // фаза run: рисуем бегунов
        shown.forEach((e, i) => {
          const y = top + i * laneH + laneH / 2 - 4;
          const meta = familyMeta(e.family);
          const bet = pendingFamily === e.family;
          let x = x0;
          if (e.ok && e.rank) {
            const ft = fts.get(e.id) ?? RUN_MS;
            const p = easeOutQuad(Math.min(1, runT / ft));
            x = x0 + p * (x1 - x0 - 8);
          }
          // свечение при ставке
          if (bet) {
            ctx.beginPath();
            ctx.arc(x + 10, y, 15, 0, Math.PI * 2);
            ctx.fillStyle = "#fbbf2422";
            ctx.fill();
            ctx.strokeStyle = "#fbbf2488";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          // капсула-бегун
          const wob = e.ok ? Math.sin(t * 0.02 + i * 1.3) * 1.6 : 0;
          ctx.beginPath();
          ctx.roundRect(x, y - 7 + wob, 20, 14, 5);
          if (e.ok) {
            ctx.fillStyle = meta.color;
            ctx.shadowColor = meta.color;
            ctx.shadowBlur = 9;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = "800 9px ui-monospace, monospace";
            ctx.fillStyle = "#09090b";
            ctx.textAlign = "center";
            ctx.fillText(e.family[0].toUpperCase(), x + 10, y + 3 + wob);
          } else {
            ctx.fillStyle = "#3f3f46";
            ctx.fill();
            ctx.font = "600 10px ui-sans-serif, system-ui";
            ctx.fillStyle = "#f87171";
            ctx.textAlign = "center";
            ctx.fillText("✕", x + 10, y + 3.5 + wob);
          }
          // подпись
          ctx.textAlign = "left";
          ctx.font = "500 10px ui-monospace, monospace";
          ctx.fillStyle = e.ok ? "rgba(212,212,216,0.75)" : "rgba(113,113,122,0.7)";
          const txt = e.ok
            ? `${e.label} · ${fmtSpeed(e.speed)}`
            : `${e.label} · ОТБРАКОВАН`;
          if (x > x1 - 130) {
            ctx.textAlign = "right";
            ctx.fillText(txt, x - 6, y + 3 + wob);
            ctx.textAlign = "left";
          } else {
            ctx.fillText(txt, x + 26, y + 3 + wob);
          }
          // финиш: корона победителю
          if (e.ok && e.rank === 1 && runT >= (fts.get(e.id) ?? RUN_MS)) {
            ctx.font = "700 13px ui-sans-serif, system-ui";
            ctx.fillStyle = "#fbbf24";
            ctx.fillText("♛", x1 + 16, y + 4 + wob);
          }
        });
      }

      // частицы (общие)
      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += 16.7;
        if (p.life > p.maxLife) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        ctx.globalAlpha = 1 - p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [pendingFamily]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ minHeight: 380 }}>
      <canvas
        ref={canvasRef}
        className="block w-full rounded-xl"
        aria-label="Гонка мутантов на арене"
        role="img"
      />
      {!running && !race && (
        <button
          onClick={onStart}
          className="absolute inset-0 flex items-end justify-center pb-6 outline-none"
          aria-label="Старт эволюции"
        >
          <span className="rounded-full bg-emerald-500/90 px-6 py-2.5 text-sm font-bold text-zinc-950 shadow-[0_0_24px_rgba(52,211,153,0.45)] transition hover:scale-105 hover:bg-emerald-400">
            ▶ Старт эволюции
          </span>
        </button>
      )}
    </div>
  );
}
