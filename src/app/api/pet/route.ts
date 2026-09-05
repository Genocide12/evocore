import { NextRequest, NextResponse } from "next/server";
import { isEngineRunning, readState, type AwayReport } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// ─── Отчёт «пока тебя не было»: что случилось с Эво, пока сайт был закрыт ───

const AWAY_MIN_MS = 5 * 60 * 1000; // короче 5 минут не считаем отсутствием

export async function GET(req: NextRequest) {
  try {
    const state = readState();
    const running = isEngineRunning();
    if (state) state.running = running;

    // since = unix-ms последнего визита клиента (localStorage)
    const since = Number(req.nextUrl.searchParams.get("since") ?? "0") || 0;
    let away: AwayReport | null = null;

    if (since > 0 && state) {
      const now = Date.now();
      const awayMs = now - since;
      if (awayMs > AWAY_MIN_MS) {
        const sinceSec = since / 1000;
        const cps = state.checkpoints ?? [];
        // последняя контрольная точка ДО ухода (если история уже вытеснилась — самая ранняя)
        let base = null as (typeof cps)[number] | null;
        for (const c of cps) if (c.ts <= sinceSec) base = c;
        if (!base && cps.length > 0 && cps[0].ts > sinceSec) base = cps[0];
        const gens = base ? Math.max(0, (state.total_generations ?? 0) - base.gen) : 0;
        const rewrites = base ? Math.max(0, (state.total_rewrites ?? 0) - base.rewrites) : 0;
        const highlights = (state.milestones ?? [])
          .filter((m) => (m.ts ?? 0) > sinceSec)
          .slice(-8);
        // есть что рассказать — только если Эво действительно жил и что-то делал
        if (gens > 0 || rewrites > 0 || highlights.length > 0) {
          away = { awayMs, gens, rewrites, highlights };
        }
      }
    }

    return NextResponse.json({ ok: true, alive: running, state, away });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      alive: false,
      state: null,
      away: null,
      error: String(e),
    });
  }
}
