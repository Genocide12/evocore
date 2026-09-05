import { NextRequest, NextResponse } from "next/server";
import { readState, resetEngine, startEngine, stopEngine } from "@/lib/evolution";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["start", "stop", "reset"]),
  generations: z.number().int().min(5).max(500).optional(),
  population: z.number().int().min(6).max(64).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid parameters: " + parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const { action, generations, population } = parsed.data;

  let result: { ok: boolean; error?: string };
  if (action === "start") {
    result = startEngine(generations ?? 50, population ?? 16);
  } else if (action === "stop") {
    result = stopEngine();
  } else {
    result = resetEngine();
  }

  const state = readState();
  return NextResponse.json({ ...result, state });
}
