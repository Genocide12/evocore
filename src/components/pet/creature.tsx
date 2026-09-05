"use client";

import { levelFor } from "@/lib/pet";

interface CreatureProps {
  speedup: number;
  running: boolean;
  excited?: boolean; // короткая вспышка радости (переписал код)
}

export default function Creature({ speedup, running, excited }: CreatureProps) {
  const { level, index } = levelFor(speedup);
  const size = Math.round(190 * level.scale);

  return (
    <div className="relative flex items-center justify-center" style={{ height: 230, width: "100%" }}>
      {/* мягкое свечение под существом */}
      <div
        className={`absolute bottom-2 h-5 rounded-[100%] bg-emerald-400/20 blur-md transition-all duration-700 ${
          running ? "w-40" : "w-28"
        }`}
      />

      {/* ДНК-частицы поднимаются, когда Эво учится */}
      {running &&
        ["🧬", "✦", "🧬", "✦", "✦"].map((p, i) => (
          <span
            key={i}
            className="evo-rise pointer-events-none absolute bottom-4 select-none text-sm opacity-0"
            style={{ left: `${12 + i * 19}%`, animationDelay: `${i * 0.9}s` }}
          >
            {p}
          </span>
        ))}

      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        className={excited ? "evo-burst" : undefined}
        aria-label={`Эво, уровень ${level.name}`}
      >
        <defs>
          <radialGradient id="evo-body" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="55%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </radialGradient>
          <radialGradient id="evo-cheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* антенна */}
        {level.antenna && (
          <g className="evo-wiggle" style={{ transformOrigin: "100px 46px" }}>
            <path d="M100 48 C 98 30, 112 26, 108 12" stroke="#10b981" strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="108" cy="10" r="7" fill="#fbbf24" />
          </g>
        )}

        {/* корона */}
        {level.crown && (
          <g className={running ? "evo-breathe-fast" : "evo-breathe"} style={{ transformOrigin: "100px 30px" }}>
            <text x="100" y="26" textAnchor="middle" fontSize="30">
              👑
            </text>
          </g>
        )}

        {/* тело */}
        <g className={running ? "evo-breathe-fast" : "evo-breathe"} style={{ transformOrigin: "100px 110px" }}>
          <ellipse cx="100" cy="110" rx="64" ry="60" fill="url(#evo-body)" />
          <ellipse cx="100" cy="110" rx="64" ry="60" fill="none" stroke="#047857" strokeOpacity="0.35" strokeWidth="2" />

          {/* блики */}
          <ellipse cx="76" cy="84" rx="16" ry="10" fill="#ffffff" opacity="0.35" transform="rotate(-24 76 84)" />

          {/* глаза (спящий вариант — дуги вместо открытых глаз) */}
          {index === 0 && !running ? (
            <g>
              <path d="M72 102 Q 80 108 88 102" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M112 102 Q 120 108 128 102" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
            </g>
          ) : (
            <g className="evo-blink" style={{ transformOrigin: "100px 100px" }}>
              <ellipse cx="80" cy="100" rx="10" ry="12" fill="#0f172a" />
              <ellipse cx="120" cy="100" rx="10" ry="12" fill="#0f172a" />
              <circle cx="83" cy="96" r="3.4" fill="#ffffff" />
              <circle cx="123" cy="96" r="3.4" fill="#ffffff" />
            </g>
          )}

          {/* щёчки */}
          <circle cx="66" cy="118" r="10" fill="url(#evo-cheek)" />
          <circle cx="134" cy="118" r="10" fill="url(#evo-cheek)" />

          {/* улыбка */}
          {running ? (
            <path d="M86 126 Q 100 140 114 126" stroke="#064e3b" strokeWidth="4" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M88 126 Q 100 135 112 126" stroke="#064e3b" strokeWidth="4" fill="none" strokeLinecap="round" />
          )}
        </g>

        {/* искры-звёздочки */}
        {Array.from({ length: level.sparkles }).map((_, i) => {
          const ang = (i / Math.max(1, level.sparkles)) * Math.PI * 2;
          const cx = 100 + Math.cos(ang) * 88;
          const cy = 105 + Math.sin(ang) * 82;
          return (
            <text
              key={i}
              x={cx}
              y={cy}
              textAnchor="middle"
              fontSize="13"
              className="evo-float"
              style={{ animationDelay: `${i * 0.45}s` }}
            >
              ✦
            </text>
          );
        })}
      </svg>

      {/* бейдж уровня */}
      <div
        className="absolute -right-1 top-2 rounded-full border border-emerald-300/40 bg-zinc-900/90 px-3 py-1 text-lg shadow-lg sm:right-2"
        title={`Уровень: ${level.name}`}
      >
        {level.emoji}
      </div>
    </div>
  );
}
