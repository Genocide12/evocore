import { NextResponse } from "next/server";
import { isEngineRunning, readState } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = readState();
    const running = isEngineRunning();
    if (state) {
      state.running = running;
    }
    return NextResponse.json({ ok: true, running, state });
  } catch (e) {
    return NextResponse.json({ ok: false, running: false, state: null, error: String(e) });
  }
}
