"use client";

import { useEffect, useRef, useState } from "react";

interface CodeWindowProps {
  code: string;
  running: boolean;
  rewrites: number; // сколько раз Эво переписал себя (всего)
}

// построчный diff по мультимножеству: какие строки новые
function diffAdded(prev: string[], next: string[]): boolean[] {
  const count = new Map<string, number>();
  for (const l of prev) count.set(l, (count.get(l) ?? 0) + 1);
  return next.map((l) => {
    const c = count.get(l) ?? 0;
    if (c > 0) {
      count.set(l, c - 1);
      return false;
    }
    return true;
  });
}

function lineClass(line: string): string {
  const t = line.trim();
  if (t.startsWith("#") || t.startsWith('"""')) return "text-zinc-500 italic";
  if (/^\s*(def |class )/.test(line)) return "text-emerald-300 font-semibold";
  if (/^\s*(import |from )/.test(line)) return "text-sky-300";
  return "text-zinc-300";
}

export default function CodeWindow({ code, running, rewrites }: CodeWindowProps) {
  const lines = code ? code.replace(/\n+$/, "").split("\n") : [];
  const prevRef = useRef<string[] | null>(null);
  const [added, setAdded] = useState<boolean[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code.trim()) return; // пустоту не сравниваем — ждём настоящий код
    const next = code.replace(/\n+$/, "").split("\n");
    const prev = prevRef.current;
    if (prev && prev.join("\n") !== next.join("\n")) {
      setAdded(diffAdded(prev, next));
      setFlashKey((k) => k + 1);
      // снять подсветку через 6 секунд
      const t = setTimeout(() => setAdded([]), 6000);
      prevRef.current = next;
      return () => clearTimeout(t);
    }
    if (!prev) prevRef.current = next;
  }, [code]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [code, flashKey]);

  const newCount = added.filter(Boolean).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <span className="text-base">🧾</span> Код Эво
          {running && <span className="evo-cursor ml-1 text-emerald-400">▊</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{lines.length} строк</span>
          {rewrites > 0 && (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-semibold text-amber-300">
              ✍️ переписан {rewrites}×
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[320px] overflow-y-auto px-1 py-2 font-mono text-[11.5px] leading-[1.55] sm:text-xs">
        {lines.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            {running ? "пишу первую строчку…" : "здесь появится мой код ✨"}
          </div>
        ) : (
          lines.map((line, i) => {
            const isNew = added[i];
            return (
              <div
                key={`${flashKey > 0 ? "c" : "i"}-${i}-${line.slice(0, 12)}`}
                className={`flex whitespace-pre ${isNew ? "evo-line-in rounded bg-emerald-500/15" : ""}`}
              >
                <span className="w-10 shrink-0 select-none pr-3 text-right text-zinc-600">{i + 1}</span>
                <span className={lineClass(line)}>{line || " "}</span>
                {isNew && <span className="pl-2 text-emerald-400">← новое</span>}
              </div>
            );
          })
        )}
      </div>

      {newCount > 0 && (
        <div className="border-t border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-center text-xs font-medium text-emerald-300">
          +{newCount} {newCount === 1 ? "строка" : "строки"} написаны только что ✍️
        </div>
      )}
    </div>
  );
}
