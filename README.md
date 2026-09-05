# EvoCore — саморазвивающаяся программа / Self-Evolving Program

> Программа, которая переписывает собственный код и становится быстрее —
> с живым веб-дашбордом в реальном времени.
> A program that rewrites its own code to become faster — with a real-time web dashboard.

---

## 🇷🇺 Русский

### Что это

EvoCore — это демонстрация **настоящей** (не симулированной) самоэволюции кода.
Внутри живёт «организм»: Python-файл `evolution/genome_core.py` с горячей функцией
`hot_path()`. Генетический алгоритм порождает реальные варианты исходного кода,
проверяет их на корректность и скорость, и если чемпион статистически быстрее —
**перезаписывает файл собственного генома**. Программа продолжает жить на новом коде.

**Как это работает:**

```
 ┌──────────────┐   мутанты (реальный Python-код)
 │  Движок GA   │──────────────┐
 │  (генетич.   │              ▼
 │  алгоритм)   │      ┌──────────────┐
 └──────────────┘      │ Корректность │  ошибка → отбраковка
                       │    + скорость│
                       └──────┬───────┘
                              ▼
                 чемпион быстрее на >1.5%?
                              │ да
                              ▼
              АТОМНАЯ перезапись genome_core.py  ← наследование
                              │
                              ▼
              Следующее поколение живёт на новом коде
```

Проверено: организм ускоряется примерно в **×4.4–4.8** за первые поколения
(полином 8-й степени, fitness = элементов/сек).

### Структура проекта

```
evocore/
├── evolution/
│   ├── evolution_core.py   # движок: GA, мутации, гейты, бенчмарк, атомная запись
│   └── genome_core.py      # ГЕНОМ — файл, который программа переписывает сама
├── src/
│   ├── app/                # Next.js дашборд + API (/api/evolution/status, /control)
│   ├── components/ui/      # shadcn/ui компоненты
│   └── lib/evolution.ts    # управление процессом движка (spawn/stop/reset)
├── Dockerfile              # Node 20 + Python 3 в одном образе
└── package.json
```

### Требования

- **Node.js ≥ 20**
- **Python ≥ 3.9** (только стандартная библиотека, `pip install` не нужен)

### Локальный запуск

```bash
npm install
npm run dev          # дашборд: http://localhost:3000
```

Откройте `http://localhost:3000` и нажмите **«Начать эволюцию»** — увидите
поколения, график приспособленности и момент перезаписи генома (зелёная точка).

Либо можно управлять движком напрямую из консоли:

```bash
python3 evolution/evolution_core.py --generations 50 --population 16   # запуск
python3 evolution/evolution_core.py --reset                            # сброс к базовому геному
```

### Деплой

#### ⚠️ Vercel — НЕ подойдёт для движка

Дашборд соберётся и откроется, но кнопка «Старт» работать не будет. Движку нужны
три вещи, которые противоречат serverless-модели Vercel:

| Что нужно движку                | Что даёт Vercel                          |
|--------------------------------|------------------------------------------|
| Долгоживущий фоновый процесс    | Функция умирает через 10–60 c            |
| Запись `genome_core.py` и state | Файловая система read-only (кроме /tmp)  |
| `spawn` дочернего python3       | Нет гарантий для фоновых процессов       |

EvoCore — это **постоянно живущий процесс с состоянием на диске**, то есть ровно
то, чем serverless не является. На Vercel можно выложить только «витрину»
без запуска эволюции.

#### ✅ Где работает по-настоящему

**Вариант 1 — Railway / Render / Fly.io (проще всего, есть Dockerfile):**

1. Запушьте репозиторий на GitHub (см. ниже).
2. Railway: `New Project → Deploy from GitHub` — платформа сама найдёт Dockerfile.
3. Render: `New → Web Service → выберите репозиторий → Environment: Docker`.
4. Fly.io: `fly launch` (детектор найдёт Dockerfile) → `fly deploy`.

Порт: 3000. Все три платформы держат постоянный процесс и диск — движок будет
эволюционировать 24/7, а дашборд доступен из любой точки мира.

**Вариант 2 — VPS (Hetzner / DigitalOcean / Oracle Free tier):**

```bash
git clone https://github.com/<вы>/evocore.git && cd evocore
docker build -t evocore . && docker run -d -p 3000:3000 --name evocore evocore
# или без Docker:
npm install && npm run build && npm start
```

**Вариант 3 — локально** (см. «Локальный запуск» выше).

#### Публикация на GitHub

```bash
cd evocore
git init && git add . && git commit -m "EvoCore: self-evolving program"
git branch -M main
git remote add origin https://github.com/<вы>/evocore.git
git push -u origin main
```

Состояние организма (`evolution/state/`) в git не попадает — каждый запуск
начинается с наивного базового генома, и эволюцию можно наблюдать с нуля.

---

## 🇬🇧 English

### What is this

EvoCore demonstrates **genuine** (not simulated) code self-evolution. Inside lives
an "organism": the Python file `evolution/genome_core.py` with a hot function
`hot_path()`. A genetic algorithm breeds real source-code variants, gates them on
correctness and speed, and when a champion is statistically faster it **atomically
rewrites its own genome file**. The program keeps living on the new code.

Measured result: the organism gets **~×4.4–4.8 faster** within the first
generations (degree-8 polynomial, fitness = elements/sec).

### Requirements

- **Node.js ≥ 20**, **Python ≥ 3.9** (stdlib only — no pip packages)

### Run locally

```bash
npm install
npm run dev        # dashboard: http://localhost:3000
```

Open the dashboard and press **Start evolution**. Or drive the engine directly:

```bash
python3 evolution/evolution_core.py --generations 50 --population 16
python3 evolution/evolution_core.py --reset
```

### Deployment

**Vercel will NOT work for the engine** (only the static dashboard would render):
serverless functions die in seconds, the filesystem is read-only, and no
background processes survive the request. EvoCore is a stateful, long-lived
process by design.

**Deploy where it works** — Railway / Render / Fly.io (Dockerfile included, port
3000) or any VPS via `docker build -t evocore . && docker run -p 3000:3000 evocore`.

### License

MIT — see [LICENSE](LICENSE).
