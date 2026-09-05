import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export const EVOLUTION_DIR = path.join(process.cwd(), "evolution");
export const ENGINE_PATH = path.join(EVOLUTION_DIR, "evolution_core.py");
export const STATE_DIR = path.join(EVOLUTION_DIR, "state");
export const STATE_PATH = path.join(STATE_DIR, "state.json");
export const PID_PATH = path.join(STATE_DIR, "evolution.pid");
export const GENOME_PATH = path.join(EVOLUTION_DIR, "genome_core.py");

export interface EvolutionEvent {
  time: string;
  type: "gen" | "install" | "info" | "warn" | "error";
  msg: string;
}

export interface HistoryPoint {
  generation: number;
  best: number;
  own: number;
  speedup: number;
  improved: boolean;
  champion: string;
  stagnation: number;
}

export interface EvolutionState {
  running: boolean;
  generation: number;
  max_generations: number;
  population: number;
  installed_genome: { strategy: string; params: Record<string, unknown> };
  installed_code: string;
  installed_speed: number;
  baseline_speed: number;
  speedup: number;
  best_speed: number;
  best_genome: { strategy: string; params: Record<string, unknown> };
  stagnation: number;
  history: HistoryPoint[];
  events: EvolutionEvent[];
  started_at: string;
  updated_at: string;
}

export function isEngineRunning(): boolean {
  try {
    const raw = fs.readFileSync(PID_PATH, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (!pid || Number.isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPERM") return true;
    return false;
  }
}

export function readState(): EvolutionState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw) as EvolutionState;
  } catch {
    return null;
  }
}

export function startEngine(
  generations: number,
  population: number
): { ok: boolean; error?: string } {
  if (isEngineRunning()) {
    return { ok: false, error: "Эволюция уже идёт / Evolution is already running" };
  }
  if (!fs.existsSync(ENGINE_PATH)) {
    return { ok: false, error: "Движок не найден / Engine not found" };
  }
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const logFd = fs.openSync(path.join(STATE_DIR, "run.log"), "a");
    const child = spawn(
      "python3",
      [
        ENGINE_PATH,
        "--generations",
        String(generations),
        "--population",
        String(population),
      ],
      {
        cwd: EVOLUTION_DIR,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      }
    );
    child.unref();
    if (!child.pid) {
      return { ok: false, error: "Не удалось запустить процесс / Failed to spawn process" };
    }
    fs.writeFileSync(PID_PATH, String(child.pid));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Spawn error: ${String(e)}` };
  }
}

export function stopEngine(): { ok: boolean; error?: string } {
  try {
    const raw = fs.readFileSync(PID_PATH, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (pid && !Number.isNaN(pid)) {
      process.kill(pid, "SIGTERM");
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export function resetEngine(): { ok: boolean; error?: string } {
  stopEngine();
  // даём процессу до 3 секунд на корректное завершение
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && isEngineRunning()) {
    spawnSync("sleep", ["0.2"]);
  }
  try {
    const res = spawnSync(
      "python3",
      [ENGINE_PATH, "--reset", "--quiet"],
      { cwd: EVOLUTION_DIR, timeout: 10000, encoding: "utf8" }
    );
    if (res.error) {
      return { ok: false, error: `Reset error: ${String(res.error)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Reset error: ${String(e)}` };
  }
}
