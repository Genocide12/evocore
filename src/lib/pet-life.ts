import { isEngineRunning, startLiveEngine } from "./evolution";

// ─── Жизнь тамагочи: Эво живёт на сервере 24/7 ───
// Один раз на процесс сервера: будим Эво и ставим «сторож», который
// перезапускает его, если процесс случайно умер. Работает независимо от
// того, открыт сайт или нет — питомец растёт даже с закрытым браузером.

const g = globalThis as unknown as { __evoLifeStarted?: boolean };

const WATCHDOG_INTERVAL_MS = 15000;

export function ensurePetAlive(): void {
  if (g.__evoLifeStarted) return;
  g.__evoLifeStarted = true;

  const wake = () => {
    try {
      if (!isEngineRunning()) {
        const r = startLiveEngine();
        if (r.ok) {
          console.log("[эво] проснулся — живой режим запущен (растёт 24/7)");
        } else {
          console.error("[эво] не удалось запустить движок:", r.error);
        }
      }
    } catch (e) {
      console.error("[эво] ошибка сторожа:", e);
    }
  };

  wake();
  const t = setInterval(wake, WATCHDOG_INTERVAL_MS);
  // не держим процесс сервера только ради таймера
  if (typeof t.unref === "function") t.unref();
}
