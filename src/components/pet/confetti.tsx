"use client";

import { useEffect, useState } from "react";

const COLORS = ["#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#f87171"];
const COUNT = 42;

interface Piece {
  id: number;
  left: number;
  dx: number;
  delay: number;
  dur: number;
  color: string;
  size: number;
  round: boolean;
}

export default function Confetti({ fireKey }: { fireKey: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!fireKey) return;
    const list: Piece[] = Array.from({ length: COUNT }).map((_, i) => ({
      id: fireKey * 1000 + i,
      left: 4 + Math.random() * 92,
      dx: -60 + Math.random() * 120,
      delay: Math.random() * 0.25,
      dur: 1.5 + Math.random() * 0.9,
      color: COLORS[i % COLORS.length],
      size: 7 + Math.random() * 7,
      round: Math.random() > 0.5,
    }));
    const t0 = setTimeout(() => setPieces(list), 0);
    const t = setTimeout(() => setPieces([]), 2800);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [fireKey]);

  if (!pieces.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="evo-confetti absolute top-[-20px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.5,
              background: p.color,
              borderRadius: p.round ? "50%" : 2,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              "--dx": `${p.dx}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
