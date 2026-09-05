#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EvoCore — саморазвивающаяся программа / Self-evolving program.

Движок: генетический алгоритм, который развивает СОБСТВЕННЫЙ код.
A genetic algorithm that evolves the program's OWN code.

Как это работает / How it works:
  1. Модуль genome_core.py содержит функцию hot_path() — «горячий код»
     организма. Движок сам исполняет её каждый generation (metabolism).
     Module genome_core.py holds hot_path() — the organism's hot code,
     executed by the engine itself every generation (metabolism).
  2. Популяция мутантов (реальные варианты исходного кода) проходит
     корректность-гейт (тесты против эталона) и бенчмарк скорости.
     A population of mutants (real source variants) passes a correctness
     gate (tests vs reference) and a speed benchmark.
  3. Чемпион, который статистически быстрее, ПЕРЕЗАПИСЫВАЕТ
     genome_core.py — программа продолжает жизнь уже на новом коде.
     A statistically faster champion REWRITES genome_core.py — the
     program keeps living on the improved code (heredity + install).
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GENOME_PATH = os.path.join(BASE_DIR, "genome_core.py")
STATE_DIR = os.path.join(BASE_DIR, "state")
STATE_PATH = os.path.join(STATE_DIR, "state.json")
PID_PATH = os.path.join(STATE_DIR, "evolution.pid")
RUN_LOG_PATH = os.path.join(STATE_DIR, "run.log")

# ------------------------- Неизменяемая «среда» -------------------------
# Целевая функция: полином степени 8 по 9 коэффициентам.
# Fitness = элементов/сек (elem/s). Больше — лучше.

DEGREE = 8
DEFAULT_COEFFS = [1.5, -0.7, 0.35, -0.21, 0.11, -0.05, 0.017, -0.004, 0.0009]
WORKLOAD_SIZE = 24000
BENCH_REPEATS = 2
INSTALL_GAIN = 1.015          # чемпион должен быть >= 1.5% быстрее
VERIFY_GAIN = 1.005           # предфильтр перед head-to-head проверкой
STAGNATION_BURST = 8          # поколений без апдейта → всплеск иммиграции
POP_MIN, POP_MAX = 6, 64
GEN_MAX = 500

STRATEGIES = ("naive", "pow_cache", "horner", "direct", "unroll")
NAIVE_GENOME = {"strategy": "naive", "params": {}}

# --------------------------- Генерация кода ----------------------------
# Геном = стратегия + параметры. Из генома РЕАЛЬНО генерируется Python-код.

GENOME_HEADER = '"""GENOME MODULE — автоматически перезаписывается движком эволюции.\n\nФункция hot_path() — «горячий код» организма: движок исполняет её в\nсобственном цикле жизни (metabolism). Каждый install перезаписывает этот\nфайл, и программа продолжает работать уже на улучшенном коде.\n\nThis file is rewritten automatically by the evolution engine.\n"""'


def horner_expr(inline: bool, var: str = "x") -> str:
    """Строит выражение Хорнера: c0 + x*(c1 + x*(... + x*c8))."""
    if inline:
        c = [repr(v) for v in DEFAULT_COEFFS]
    else:
        c = ["c%d" % i for i in range(9)]
    e = c[8]
    for i in range(7, -1, -1):
        e = "(%s + %s * %s)" % (c[i], var, e)
    return e


def _body_naive() -> str:
    return (
        "    total = 0.0\n"
        "    for x in xs:\n"
        "        for i in range(len(coeffs)):\n"
        "            total += coeffs[i] * (x ** i)\n"
        "    return total"
    )


def _body_pow_cache() -> str:
    return (
        "    total = 0.0\n"
        "    for x in xs:\n"
        "        p = 1.0\n"
        "        for c in coeffs:\n"
        "            total += c * p\n"
        "            p *= x\n"
        "    return total"
    )


def _body_horner(params: dict) -> str:
    if params.get("precomputed_reverse", False):
        head = "    seq = coeffs[::-1]\n"
        loop = "        for c in seq:"
    else:
        head = ""
        loop = "        for c in coeffs[::-1]:"
    return (
        head
        + "    total = 0.0\n"
        + "    for x in xs:\n"
        + "        acc = 0.0\n"
        + loop + "\n"
        + "            acc = acc * x + c\n"
        + "        total += acc\n"
        + "    return total"
    )


def _body_direct(params: dict) -> str:
    inline = bool(params.get("inline_consts", False))
    decl = "" if inline else "    c0, c1, c2, c3, c4, c5, c6, c7, c8 = coeffs\n"
    return (
        decl
        + "    total = 0.0\n"
        + "    for x in xs:\n"
        + "        total += %s\n" % horner_expr(inline)
        + "    return total"
    )


def _body_unroll(params: dict) -> str:
    inline = bool(params.get("inline_consts", False))
    u = int(params.get("unroll", 4))
    u = max(2, min(8, u))
    decl = "" if inline else "    c0, c1, c2, c3, c4, c5, c6, c7, c8 = coeffs\n"
    exprs = " + ".join(horner_expr(inline, "xs[i + %d]" % k) for k in range(u))
    return (
        decl
        + "    n = len(xs)\n"
        + "    lim = n - (n %% %d)\n" % u
        + "    total = 0.0\n"
        + "    for i in range(0, lim, %d):\n" % u
        + "        total += %s\n" % exprs
        + "    for j in range(lim, n):\n"
        + "        x = xs[j]\n"
        + "        total += %s\n" % horner_expr(inline)
        + "    return total"
    )


def generate_source(genome: dict) -> str:
    """Геном → реальный исходный код модуля genome_core.py."""
    s = genome.get("strategy", "naive")
    params = genome.get("params", {}) or {}
    if s == "naive":
        body = _body_naive()
    elif s == "pow_cache":
        body = _body_pow_cache()
    elif s == "horner":
        body = _body_horner(params)
    elif s == "direct":
        body = _body_direct(params)
    elif s == "unroll":
        body = _body_unroll(params)
    else:
        body = _body_naive()
    coeffs_line = "DEFAULT_COEFFS = [" + ", ".join(repr(c) for c in DEFAULT_COEFFS) + "]"
    return (
        GENOME_HEADER
        + "\n\n"
        + coeffs_line
        + "\n\n\ndef hot_path(xs, coeffs=None):\n"
        + "    if coeffs is None:\n"
        + "        coeffs = DEFAULT_COEFFS\n"
        + body
        + "\n"
    )


def describe(genome: dict) -> str:
    s = genome.get("strategy", "?")
    p = genome.get("params", {}) or {}
    bits = []
    if "precomputed_reverse" in p:
        bits.append("precomp=%s" % ("on" if p["precomputed_reverse"] else "off"))
    if "inline_consts" in p:
        bits.append("inline=%s" % ("on" if p["inline_consts"] else "off"))
    if "unroll" in p:
        bits.append("u=%s" % p["unroll"])
    return s + ("{" + ",".join(bits) + "}" if bits else "{}")

# ------------------------- Среда тестирования --------------------------

def reference_hot_path(xs, coeffs):
    """Эталон (неизменяемый): чистая схема Горнера."""
    total = 0.0
    for x in xs:
        p = 1.0
        for c in coeffs:
            total += c * p
            p *= x
    return total


def make_datasets():
    rng = random.Random(12345)
    tests = []
    for size in (64, 256, 512):
        xs = [rng.uniform(-2.0, 2.0) for _ in range(size)]
        tests.append((xs, reference_hot_path(xs, DEFAULT_COEFFS)))
    return tests


def make_workload():
    rng = random.Random(777)
    return [rng.uniform(-1.5, 1.5) for _ in range(WORKLOAD_SIZE)]


def load_function_from_source(source: str):
    """Компилирует исходник и достаёт из него hot_path()."""
    try:
        ns: dict = {"__name__": "genome_variant", "__file__": GENOME_PATH}
        exec(compile(source, GENOME_PATH, "exec"), ns)
        fn = ns.get("hot_path")
        if not callable(fn):
            return None
        return fn
    except Exception:
        return None


def check_correct(fn, tests) -> bool:
    try:
        for xs, expected in tests:
            got = fn(list(xs), DEFAULT_COEFFS)
            if not isinstance(got, (int, float)) or isinstance(got, bool):
                return False
            if math.isnan(got) or math.isinf(got):
                return False
            denom = max(1.0, abs(expected))
            if abs(got - expected) / denom > 1e-9:
                return False
        return True
    except Exception:
        return False


def benchmark(fn, xs):
    """Лучший из BENCH_REPEATS прогонов; возвращает секунды или None."""
    best = None
    try:
        for _ in range(BENCH_REPEATS):
            gc.collect()
            t0 = time.perf_counter()
            r = fn(xs, DEFAULT_COEFFS)
            dt = time.perf_counter() - t0
            if not isinstance(r, (int, float)) or math.isnan(r) or math.isinf(r):
                return None
            best = dt if best is None else min(best, dt)
    except Exception:
        return None
    return best

# ------------------------------ Геномы ---------------------------------

def random_genome(rng: random.Random) -> dict:
    s = rng.choice(STRATEGIES)
    params: dict = {}
    if s == "horner":
        params["precomputed_reverse"] = rng.random() < 0.5
    elif s in ("direct", "unroll"):
        params["inline_consts"] = rng.random() < 0.6
        if s == "unroll":
            params["unroll"] = rng.choice((2, 3, 4, 6, 8))
    return {"strategy": s, "params": params}


def mutate(genome: dict, rng: random.Random) -> dict:
    r = rng.random()
    if r < 0.22:
        return random_genome(rng)  # большой скачок стратегии
    g = {"strategy": genome.get("strategy", "naive"), "params": dict(genome.get("params", {}) or {})}
    if g["strategy"] == "horner":
        if rng.random() < 0.75:
            g["params"]["precomputed_reverse"] = not g["params"].get("precomputed_reverse", False)
        else:
            g = random_genome(rng)
    elif g["strategy"] in ("direct", "unroll"):
        if rng.random() < 0.5:
            g["params"]["inline_consts"] = not g["params"].get("inline_consts", False)
        if g["strategy"] == "unroll" and rng.random() < 0.6:
            opts = (2, 3, 4, 6, 8)
            cur = int(g["params"].get("unroll", 4))
            idx = opts.index(cur) if cur in opts else 2
            g["params"]["unroll"] = opts[max(0, min(len(opts) - 1, idx + rng.choice((-1, 1))))]
        if rng.random() < 0.12:
            g = random_genome(rng)
    else:
        g = random_genome(rng)  # naive / pow_cache — только скачок
    return g


def crossover(a: dict, b: dict, rng: random.Random) -> dict:
    if rng.random() < 0.5:
        a, b = b, a
    g = {"strategy": a["strategy"], "params": dict(a.get("params", {}) or {})}
    for k, v in (b.get("params", {}) or {}).items():
        if rng.random() < 0.45:
            g["params"][k] = v
    return g

# ------------------------------ Логгер ---------------------------------

ANSI = {
    "gen": "\033[96m",      # cyan
    "install": "\033[92m",  # green
    "info": "\033[0m",
    "warn": "\033[93m",     # yellow
    "error": "\033[91m",    # red
    "reset": "\033[0m",
}


def fmt_speed(speed: float) -> str:
    if speed >= 1_000_000:
        return "%.2fM" % (speed / 1_000_000)
    if speed >= 1_000:
        return "%.1fK" % (speed / 1_000)
    return "%.0f" % speed


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

# ------------------------------ Движок ---------------------------------

class EvolutionEngine:
    def __init__(self, generations: int, population: int, quiet: bool = False):
        self.generations = generations
        self.population = population
        self.quiet = quiet
        self.rng = random.Random(time.time_ns() & 0xFFFFFFFF)
        self.stop_flag = False

        self.workload = make_workload()
        self.tests = make_datasets()
        self.naive_fn = load_function_from_source(generate_source(NAIVE_GENOME))
        if self.naive_fn is None:
            raise RuntimeError("cannot compile naive baseline reference")

        self.installed_genome: dict = dict(NAIVE_GENOME)
        self.installed_fn = None
        self.installed_source: str = ""
        self.baseline_speed: float = 0.0
        self.installed_speed: float = 0.0
        self.history: list = []
        self.events: list = []
        self.generation: int = 0
        self.stagnation: int = 0
        self.best_speed: float = 0.0
        self.best_genome: dict = dict(NAIVE_GENOME)
        self.started_at: str = now_iso()

    # -------- служебное --------

    def log(self, kind: str, msg: str) -> None:
        evt = {"time": datetime.now().strftime("%H:%M:%S"), "type": kind, "msg": msg}
        self.events.append(evt)
        if len(self.events) > 300:
            self.events = self.events[-300:]
        line = "[%s] %s" % (evt["time"], msg)
        if not self.quiet:
            color = ANSI.get(kind, "")
            try:
                print(color + line + "\033[0m", flush=True)
            except Exception:
                pass
        try:
            with open(RUN_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def load_state(self) -> None:
        """Продолжение предыдущего прогона: наследование установленного генома."""
        if not os.path.exists(STATE_PATH):
            return
        try:
            with open(STATE_PATH, encoding="utf-8") as f:
                st = json.load(f)
            g = st.get("installed_genome")
            if isinstance(g, dict) and g.get("strategy") in STRATEGIES:
                self.installed_genome = {"strategy": g["strategy"], "params": dict(g.get("params", {}) or {})}
            self.history = list(st.get("history", []))[-1000:]
            self.events = list(st.get("events", []))[-300:]
            # baseline_speed НЕ наследуем: он честно перемеряется в каждом окне
            self.best_speed = float(st.get("best_speed", 0.0)) or 0.0
            bg = st.get("best_genome")
            if isinstance(bg, dict) and bg.get("strategy") in STRATEGIES:
                self.best_genome = dict(bg)
            self.stagnation = int(st.get("stagnation", 0))
            self.generation = int(st.get("generation", 0))
        except Exception:
            pass

    def load_installed(self) -> None:
        """Читает собственный код организма; повреждённый файл — откат."""
        source = None
        try:
            if os.path.exists(GENOME_PATH):
                with open(GENOME_PATH, encoding="utf-8") as f:
                    source = f.read()
        except Exception:
            source = None
        fn = load_function_from_source(source) if source else None
        if fn is None:
            source = generate_source(self.installed_genome)
            fn = load_function_from_source(source)
            if fn is None:  # не должно случиться никогда
                self.installed_genome = dict(NAIVE_GENOME)
                source = generate_source(NAIVE_GENOME)
                fn = load_function_from_source(source)
        self.installed_source = source
        self.installed_fn = fn

    def write_pid(self) -> None:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(PID_PATH, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))

    def remove_pid(self) -> None:
        try:
            os.remove(PID_PATH)
        except OSError:
            pass

    @staticmethod
    def already_running() -> bool:
        try:
            with open(PID_PATH, encoding="utf-8") as f:
                pid = int(f.read().strip())
            if pid == os.getpid():
                # это мы сами: PID-файл записан родителем (API) при spawn
                return False
            os.kill(pid, 0)
            return True
        except (OSError, ValueError):
            return False

    def save_state(self, running: bool) -> None:
        os.makedirs(STATE_DIR, exist_ok=True)
        st = {
            "running": running,
            "generation": self.generation,
            "max_generations": self.generations,
            "population": self.population,
            "installed_genome": self.installed_genome,
            "installed_code": self.installed_source,
            "installed_speed": round(self.installed_speed, 1),
            "baseline_speed": round(self.baseline_speed, 1),
            "speedup": round(self.installed_speed / self.baseline_speed, 3) if self.baseline_speed > 0 else 1.0,
            "best_speed": round(self.best_speed, 1),
            "best_genome": self.best_genome,
            "stagnation": self.stagnation,
            "history": self.history[-1000:],
            "events": self.events[-300:],
            "started_at": self.started_at,
            "updated_at": now_iso(),
        }
        tmp = STATE_PATH + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(st, f, ensure_ascii=False)
            os.replace(tmp, STATE_PATH)
        except Exception:
            pass

    # -------- жизненный цикл организма --------

    def metabolize(self) -> float:
        """Организм исполняет собственный (эволюционирующий) код; в ТОМ ЖЕ
        окне чередуясь меряется наивный baseline (best-of-3 на сторону) —
        числитель и знаменатель speedup всегда в равных условиях."""
        best_in = None
        best_naive = None
        for _ in range(3):
            gc.collect()
            t0 = time.perf_counter()
            self.installed_fn(self.workload, DEFAULT_COEFFS)
            dt = time.perf_counter() - t0
            best_in = dt if best_in is None else min(best_in, dt)
            gc.collect()
            t0 = time.perf_counter()
            self.naive_fn(self.workload, DEFAULT_COEFFS)
            dt = time.perf_counter() - t0
            best_naive = dt if best_naive is None else min(best_naive, dt)
        self.installed_speed = WORKLOAD_SIZE / best_in if best_in and best_in > 0 else 0.0
        if best_naive and best_naive > 0:
            self.baseline_speed = WORKLOAD_SIZE / best_naive
        return self.installed_speed

    def evaluate(self, genome: dict) -> dict:
        src = generate_source(genome)
        fn = load_function_from_source(src)
        if fn is None:
            return {"genome": genome, "ok": False, "speed": 0.0, "error": "compile error"}
        if not check_correct(fn, self.tests):
            return {"genome": genome, "ok": False, "speed": 0.0, "error": "correctness gate"}
        dt = benchmark(fn, self.workload)
        if dt is None or dt <= 0:
            return {"genome": genome, "ok": False, "speed": 0.0, "error": "benchmark fail"}
        return {"genome": genome, "ok": True, "speed": WORKLOAD_SIZE / dt, "time": dt}

    def verify_head_to_head(self, champ_fn) -> float:
        """Честная проверка: чемпион против установленного кода, 3 раунда
        по очереди в одном окне (оба под одинаковым троттлингом/шумом)."""
        best_ch = None
        best_in = None
        for _ in range(3):
            gc.collect()
            t0 = time.perf_counter()
            champ_fn(self.workload, DEFAULT_COEFFS)
            dt = time.perf_counter() - t0
            best_ch = dt if best_ch is None else min(best_ch, dt)
            gc.collect()
            t0 = time.perf_counter()
            self.installed_fn(self.workload, DEFAULT_COEFFS)
            dt = time.perf_counter() - t0
            best_in = dt if best_in is None else min(best_in, dt)
        if not best_ch or not best_in:
            return 0.0
        return best_in / best_ch

    def install(self, genome: dict, ratio: float) -> bool:
        """Чемпион перезаписывает СОБСТВЕННЫЙ файл кода программы."""
        src = generate_source(genome)
        fn2 = load_function_from_source(src)
        if fn2 is None or not check_correct(fn2, self.tests):
            return False
        try:
            os.makedirs(BASE_DIR, exist_ok=True)
            tmp = GENOME_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(src)
            os.replace(tmp, GENOME_PATH)
        except Exception as e:
            self.log("error", "install failed: %s" % e)
            return False
        prev = describe(self.installed_genome)
        self.installed_genome = {"strategy": genome["strategy"], "params": dict(genome.get("params", {}) or {})}
        self.installed_source = src
        self.installed_fn = fn2
        self.metabolize()
        speedup = self.installed_speed / self.baseline_speed if self.baseline_speed > 0 else 0.0
        self.log(
            "install",
            "INSTALL | собственный код переписан: %s -> %s | verified +%.1f%% head-to-head | vitals: %s elem/s (x%.2f к naive)"
            % (prev, describe(self.installed_genome), (ratio - 1.0) * 100.0, fmt_speed(self.installed_speed), speedup),
        )
        return True

    def build_population(self, top_prev: list) -> list:
        rng = self.rng
        pop: list = [dict(self.installed_genome)]
        burst = self.stagnation >= STAGNATION_BURST
        immigrant_rate = 0.4 if burst else 0.12
        while len(pop) < self.population:
            r = rng.random()
            if r < immigrant_rate:
                pop.append(random_genome(rng))
            elif top_prev and len(top_prev) >= 2 and rng.random() < 0.35:
                pool = top_prev[:3]
                a, b = rng.sample(pool, 2)
                pop.append(mutate(crossover(a, b, rng), rng))
            else:
                base = rng.choice(top_prev) if (top_prev and rng.random() < 0.6) else self.installed_genome
                pop.append(mutate(base, rng))
        return pop[: self.population]

    # -------- главный цикл --------

    def run(self) -> None:
        if self.already_running():
            print("EvoCore already running — exit.", flush=True)
            return
        os.makedirs(STATE_DIR, exist_ok=True)
        self.write_pid()
        try:
            self.load_state()
            self.load_installed()
            # прогрев + первые честные замеры: организм и наивный baseline в одном окне
            self.installed_fn(self.workload, DEFAULT_COEFFS)
            self.metabolize()
            self.log(
                "info",
                "START | population=%d generations=%d | организм: %s | vitals %s elem/s"
                % (self.population, self.generations, describe(self.installed_genome), fmt_speed(self.installed_speed)),
            )
            self.save_state(running=True)

            top_prev: list = []
            for gen in range(1, self.generations + 1):
                if self.stop_flag:
                    break
                self.generation = gen
                burst = self.stagnation >= STAGNATION_BURST
                if burst and self.stagnation == STAGNATION_BURST and gen > 1:
                    self.log("warn", "Стагнация %d поколений — punctuated equilibrium: включён всплеск иммиграции" % self.stagnation)
                self.metabolize()
                pop = self.build_population(top_prev)
                evaluated = [self.evaluate(g) for g in pop]
                ok = [e for e in evaluated if e["ok"]]
                bad = [e for e in evaluated if not e["ok"]]
                ok.sort(key=lambda e: e["speed"], reverse=True)
                if bad and gen % 3 == 0:
                    b = bad[0]
                    self.log("warn", "Отбраковано %d мутантов (напр. %s: %s)" % (len(bad), describe(b["genome"]), b["error"]))
                champion = ok[0] if ok else None
                updated = False
                if champion is not None:
                    same = describe(champion["genome"]) == describe(self.installed_genome)
                    cand_fn = None
                    if not same and champion["speed"] > self.installed_speed * VERIFY_GAIN:
                        cand_fn = load_function_from_source(generate_source(champion["genome"]))
                    if cand_fn is not None:
                        ratio = self.verify_head_to_head(cand_fn)
                        if ratio >= INSTALL_GAIN:
                            updated = self.install(champion["genome"], ratio)
                    best_speed = champion["speed"]
                    best_genome = champion["genome"]
                else:
                    best_speed = self.installed_speed
                    best_genome = self.installed_genome
                if best_speed > self.best_speed:
                    self.best_speed = best_speed
                    self.best_genome = {"strategy": best_genome["strategy"], "params": dict(best_genome.get("params", {}) or {})}
                if updated:
                    self.stagnation = 0
                else:
                    self.stagnation += 1
                top_prev = [e["genome"] for e in ok[:3]]
                speedup = self.installed_speed / self.baseline_speed if self.baseline_speed > 0 else 1.0
                self.history.append(
                    {
                        "generation": gen,
                        "best": round(best_speed, 1),
                        "own": round(self.installed_speed, 1),
                        "speedup": round(speedup, 3),
                        "improved": updated,
                        "champion": describe(best_genome),
                        "stagnation": self.stagnation,
                    }
                )
                if len(self.history) > 1000:
                    self.history = self.history[-1000:]
                mark = "  ==> UPDATE (install)" if updated else ""
                self.log(
                    "gen",
                    "GEN %03d/%03d | best fitness %s | organism %s elem/s | x%.2f%s"
                    % (gen, self.generations, fmt_speed(best_speed), fmt_speed(self.installed_speed), speedup, mark),
                )
                self.save_state(running=True)
            speedup = self.installed_speed / self.baseline_speed if self.baseline_speed > 0 else 1.0
            self.log("info", "FINISH | поколений: %d | итоговое ускорение организма: x%.2f | код: %s" % (self.generation, speedup, describe(self.installed_genome)))
        finally:
            self.save_state(running=False)
            self.remove_pid()

    def request_stop(self, *_args) -> None:
        self.stop_flag = True


def do_reset(quiet: bool = False) -> None:
    """Сброс: организм возвращается к наивной версии, история очищается."""
    os.makedirs(STATE_DIR, exist_ok=True)
    if EvolutionEngine.already_running():
        try:
            with open(PID_PATH, encoding="utf-8") as f:
                pid = int(f.read().strip())
            os.kill(pid, signal.SIGTERM)
            for _ in range(30):
                time.sleep(0.1)
                try:
                    os.kill(pid, 0)
                except OSError:
                    break
        except (OSError, ValueError):
            pass
    src = generate_source(NAIVE_GENOME)
    with open(GENOME_PATH, "w", encoding="utf-8") as f:
        f.write(src)
    for p in (STATE_PATH, RUN_LOG_PATH, PID_PATH):
        try:
            os.remove(p)
        except OSError:
            pass
    if not quiet:
        print("Reset done: genome_core.py -> naive baseline, state cleared.", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="EvoCore — self-evolving program engine")
    ap.add_argument("--generations", type=int, default=50, help="max generations")
    ap.add_argument("--population", type=int, default=16, help="population size")
    ap.add_argument("--reset", action="store_true", help="reset organism to naive baseline")
    ap.add_argument("--quiet", action="store_true", help="no ANSI console output")
    args = ap.parse_args()

    if args.reset:
        do_reset(quiet=args.quiet)
        return 0

    generations = max(1, min(GEN_MAX, args.generations))
    population = max(POP_MIN, min(POP_MAX, args.population))

    engine = EvolutionEngine(generations, population, quiet=args.quiet)
    signal.signal(signal.SIGTERM, engine.request_stop)
    signal.signal(signal.SIGINT, engine.request_stop)
    engine.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
