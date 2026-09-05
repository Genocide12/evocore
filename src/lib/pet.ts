// ─── Эво: уровни роста и перевод событий движка на простой язык ───

export interface PetLevel {
  min: number; // порог по реальной силе (speedup к наивному коду)
  name: string;
  emoji: string;
  scale: number; // визуальный размер существа
  sparkles: number; // сколько искр вокруг
  antenna: boolean;
  crown: boolean;
}

// ─── Длительности по-человечески («2 ч 5 мин», «3 дн 4 ч») ───

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} дн ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return "меньше минуты";
}

export function formatAge(bornIso: string | undefined): string {
  const born = bornIso ? Date.parse(bornIso) : NaN;
  if (!Number.isFinite(born)) return "только что родился";
  return formatDuration(Date.now() - born);
}

export const LEVELS: PetLevel[] = [
  { min: 0.0, name: "Яичко", emoji: "🥚", scale: 0.78, sparkles: 0, antenna: false, crown: false },
  { min: 1.1, name: "Птенчик", emoji: "🐣", scale: 0.88, sparkles: 1, antenna: false, crown: false },
  { min: 1.35, name: "Умник", emoji: "🐥", scale: 0.96, sparkles: 2, antenna: true, crown: false },
  { min: 1.8, name: "Знаток", emoji: "🦜", scale: 1.04, sparkles: 3, antenna: true, crown: false },
  { min: 2.5, name: "Мастер", emoji: "🦉", scale: 1.12, sparkles: 4, antenna: true, crown: false },
  { min: 3.5, name: "Гений", emoji: "🧠", scale: 1.2, sparkles: 5, antenna: true, crown: true },
  { min: 5.0, name: "Волшебник", emoji: "🧙", scale: 1.28, sparkles: 6, antenna: true, crown: true },
  { min: 7.0, name: "Легенда", emoji: "🐉", scale: 1.36, sparkles: 8, antenna: true, crown: true },
];

export function levelFor(speedup: number): {
  level: PetLevel;
  index: number;
  next: PetLevel | null;
  progress: number; // 0..1 до следующего уровня
} {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (speedup >= LEVELS[i].min) index = i;
  const level = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const progress = next
    ? Math.min(1, Math.max(0, (speedup - level.min) / (next.min - level.min)))
    : 1;
  return { level, index, next, progress };
}

// ─── События движка → простые человеческие фразы ───

export type FeedTone = "win" | "info" | "warn";

export interface FeedItem {
  id: string;
  time: string;
  emoji: string;
  text: string;
  tone: FeedTone;
}

export function translateEvent(e: {
  time: string;
  type: string;
  msg: string;
}): FeedItem | null {
  const msg = e.msg;

  if (msg.startsWith("INSTALL")) {
    const m = msg.match(/verified \+?(\d+(?:\.\d+)?)%/);
    const pct = m ? m[1] : null;
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "🎉",
      tone: "win",
      text: pct
        ? `Переписал свой код! Стал быстрее на +${pct}%`
        : "Переписал свой код и стал быстрее!",
    };
  }

  if (msg.startsWith("RECORD")) {
    const m = msg.match(/x(\d+(?:\.\d+)?)/);
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "🏆",
      tone: "win",
      text: m ? `Новый личный рекорд: сила ×${m[1]}!` : "Новый личный рекорд силы!",
    };
  }

  if (msg.startsWith("Угощение")) {
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "🍎",
      tone: "win",
      text: "Ура, угощение! Кушаю и учусь быстрее",
    };
  }

  if (msg.startsWith("Витамины")) {
    return null; // служебное — не спамим в дневнике
  }

  if (msg.startsWith("GEN")) {
    if (!msg.includes("UPDATE")) return null; // обычные поколения не спамим в ленте
    const m = msg.match(/^GEN (\d+)/);
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "✨",
      tone: "win",
      text: m ? `Поколение ${parseInt(m[1], 10)}: нашёл способ стать быстрее!` : "Нашёл способ стать быстрее!",
    };
  }

  if (msg.startsWith("Стагнация") || msg.includes("иммиграции")) {
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "💡",
      tone: "warn",
      text: "Застрял! Позвал себе свежие идеи со стороны",
    };
  }

  if (msg.startsWith("Отбраковано")) {
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "🧹",
      tone: "info",
      text: "Слабые варианты выбросил — оставил только лучших",
    };
  }

  if (msg.startsWith("START")) {
    if (msg.includes("живой режим")) {
      return {
        id: `${e.time}|${msg.length}`,
        time: e.time,
        emoji: "☀️",
        tone: "info",
        text: "Я снова живу и учусь — буду расти без остановки!",
      };
    }
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "🌱",
      tone: "info",
      text: "Проснулся и начал учиться!",
    };
  }

  if (msg.startsWith("FINISH")) {
    const m = msg.match(/x(\d+(?:\.\d+)?)/);
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "💤",
      tone: "info",
      text: m ? `Заснул на минутку. Моя сила ×${m[1]}` : "Заснул на минутку…",
    };
  }

  if (msg.startsWith("install failed")) {
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "😅",
      tone: "warn",
      text: "Ой! Новый код не подошёл — откатился назад",
    };
  }

  if (e.type === "error") {
    return {
      id: `${e.time}|${msg.length}`,
      time: e.time,
      emoji: "😅",
      tone: "warn",
      text: "Мутант не получился. Ничего, попробую ещё!",
    };
  }

  return null;
}
