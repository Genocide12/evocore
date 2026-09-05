"use client";

import { translateEvent, formatDuration, type FeedItem } from "@/lib/pet";
import type { AwayReport } from "@/lib/evolution";

// ─── Модалка «С возвращением!»: отчёт Эво о жизни без тебя ───

export default function AwayModal({
  report,
  speedupNow,
  onClose,
}: {
  report: AwayReport;
  speedupNow: number;
  onClose: () => void;
}) {
  const items: FeedItem[] = [];
  for (let i = report.highlights.length - 1; i >= 0 && items.length < 6; i--) {
    const item = translateEvent(report.highlights[i]);
    if (item) items.push(item);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Отчёт о жизни Эво в твоё отсутствие"
    >
      <div className="evo-pop w-full max-w-sm rounded-3xl border border-emerald-400/30 bg-zinc-900 p-6 shadow-2xl">
        <div className="text-center text-5xl">🤗</div>
        <h2 className="mt-2 text-center text-2xl font-black">С возвращением!</h2>
        <p className="mt-1.5 text-center text-sm leading-relaxed text-zinc-400">
          Я жил и расту без тебя уже {formatDuration(report.awayMs)} — и всё это время
          писал свой код!
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-zinc-800/70 px-1 py-3">
            <div className="text-xl">🧬</div>
            <div className="text-lg font-black text-emerald-300 tabular-nums">+{report.gens}</div>
            <div className="text-[10px] leading-tight text-zinc-400">поколений</div>
          </div>
          <div className="rounded-2xl bg-zinc-800/70 px-1 py-3">
            <div className="text-xl">✍️</div>
            <div className="text-lg font-black text-amber-300 tabular-nums">×{report.rewrites}</div>
            <div className="text-[10px] leading-tight text-zinc-400">переписал код</div>
          </div>
          <div className="rounded-2xl bg-zinc-800/70 px-1 py-3">
            <div className="text-xl">💪</div>
            <div className="text-lg font-black text-emerald-300 tabular-nums">×{speedupNow.toFixed(2)}</div>
            <div className="text-[10px] leading-tight text-zinc-400">моя сила</div>
          </div>
        </div>

        {items.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
            {items.map((f) => (
              <li
                key={`${f.time}-${f.id}`}
                className="flex items-start gap-2 rounded-xl bg-zinc-800/50 px-3 py-1.5 text-xs leading-snug text-zinc-200"
              >
                <span className="mt-0.5 leading-none">{f.emoji}</span>
                <span className="flex-1">{f.text}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{f.time}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onClose}
          autoFocus
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 py-3.5 text-lg font-black text-emerald-950 shadow-lg transition-all active:scale-95"
        >
          Обнять! 🤗
        </button>
      </div>
    </div>
  );
}
