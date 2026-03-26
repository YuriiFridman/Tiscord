# Tiscord

Tiscord — Discord-подобное приложение:
- **Backend**: FastAPI (Python 3.11+), WebSocket `/ws`, REST API с префиксом `/api/v1`.
- **Desktop/Frontend**: Vite + React + TypeScript (папка `desktop`). Поддерживается сборка в `.exe` через **Tauri**.

---

## Содержание

1. [Требования](#1-требования)
2. [Структура репозитория](#2-структура-репозитория)
3. [Локальный запуск (быстрый старт)](#3-локальный-запуск-быстрый-старт)
4. [Переменные окружения Backend (.env)](#4-переменные-окружения-backend-env)
5. [Запуск Backend локально](#5-запуск-backend-локально)
6. [Запуск Frontend локально (Vite)](#6-запуск-frontend-локально-vite)
7. [Локальный запуск на Windows](#7-локальный-запуск-на-windows)
8. [Сборка Desktop-приложения (.exe) с Tauri](#8-сборка-desktop-приложения-exe-с-tauri)
9. [Деплой Backend на Railway](#9-деплой-backend-на-railway)
10. [Деплой PostgreSQL на Railway](#10-деплой-postgresql-на-railway)
11. [Деплой Frontend (Vercel / Netlify / Railway)](#11-деплой-frontend-vercel--netlify--railway)
12. [Настройка домена, HTTPS, CORS](#12-настройка-домена-https-cors)
13. [WebSocket и звонки (STUN/TURN)](#13-websocket-и-звонки-stunturn)
14. [Миграции БД (Alembic)](#14-миграции-бд-alembic)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Требования

### Для локальной разработки (macOS/Linux)
- Git
- Python **3.11+**
- Node.js **18+** (рекомендуется 20 LTS)
- PostgreSQL **14+** (или через Docker)

### Для Windows
- Git for Windows
- Python **3.11+** (официальный установщик, с галочкой **Add python.exe to PATH**)
- Node.js **18+**
- PostgreSQL локально **или** Docker Desktop

### Дополнительно для сборки .exe (Tauri)
- **Rust** (установить через https://rustup.rs)
- **WebView2** (на Windows обычно уже установлен через Edge)

---

## 2. Структура репозитория

```
Tiscord/
├── backend/              # FastAPI приложение
│   ├── app/
│   │   ├── main.py       # Точка входа FastAPI
│   │   ├── config.py     # Настройки (env-переменные)
│   │   └── ...
│   ├── alembic/          # Миграции БД
│   ├── Dockerfile        # Docker-образ backend
│   ├── railway.toml      # Конфиг Railway
│   ├── requirements.txt  # Python-зависимости
│   └── .env.example      # Шаблон переменных окружения
└── desktop/              # Vite + React + TypeScript
    ├── src/
    ├── vite.config.ts    # Vite (dev-порт 1420)
    ├── package.json      # npm-скрипты
    └── .env.example      # Шаблон env-переменных фронтенда
```

---

## 3. Локальный запуск (быстрый старт)

### 3.1. Клонирование
```bash
git clone https://github.com/YuriiFridman/Tiscord.git
cd Tiscord
```

### 3.2. Backend (Linux/macOS)
```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
cp .env.example .env     # отредактируйте DATABASE_URL и JWT_SECRET
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3.3. Frontend
```bash
cd desktop
cp .env.example .env.local   # при необходимости укажите VITE_API_URL
npm install
npm run dev
```

Открыть: http://localhost:1420

---

## 4. Переменные окружения Backend (.env)

Скопируйте `backend/.env.example` в `backend/.env` и заполните:

```env
# PostgreSQL (asyncpg-формат, обязателен)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/tiscord

# JWT — сменить перед продакшеном (минимум 32 символа)
JWT_SECRET=changeme-in-production
JWT_ACCESS_EXPIRE_MINUTES=60
JWT_REFRESH_EXPIRE_DAYS=30

# Хранилище файлов: "local" или "s3"
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./uploads

# CORS — в dev допустимо "*", в prod — только свои домены
CORS_ORIGINS=*
```

> **Важно:** Railway и некоторые хостинги выдают `DATABASE_URL` в формате `postgres://...`.
> Приложение **автоматически** конвертирует его в `postgresql+asyncpg://` — дополнительных действий не нужно.

---

## 5. Запуск Backend локально

### 5.1. PostgreSQL

**Вариант A — локальная установка:**
```bash
psql -U postgres -c "CREATE DATABASE tiscord;"
```

**Вариант B — Docker:**
```bash
docker run --name tiscord-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=tiscord \
  -p 5432:5432 -d postgres:16
```

Установить в `.env`:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tiscord
```

### 5.2. Миграции
```bash
cd backend && source .venv/bin/activate
alembic upgrade head
```

### 5.3. Запуск сервера
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Полезные URL:
- Health: http://127.0.0.1:8000/health
- Swagger: http://127.0.0.1:8000/docs
- WebSocket: `ws://127.0.0.1:8000/ws?token=...`

---

## 6. Запуск Frontend локально (Vite)

```bash
cd desktop
npm install
npm run dev
```

Dev-сервер: http://localhost:1420

Если нужно переопределить адрес API (по умолчанию `http://localhost:8000`):
```
# desktop/.env.local
VITE_API_URL=http://127.0.0.1:8000
VITE_WS_URL=ws://127.0.0.1:8000/ws
```

---

## 7. Локальный запуск на Windows

### 7.1. Установить инструменты

- **Git for Windows**: https://git-scm.com/download/win
- **Python 3.11+**: https://www.python.org/downloads/ → галочка **Add python.exe to PATH**
- **Node.js 20 LTS**: https://nodejs.org/

Проверка в PowerShell:
```powershell
python --version
node -v
npm -v
```

### 7.2. Клонировать репозиторий
```powershell
git clone https://github.com/YuriiFridman/Tiscord.git
cd Tiscord
```

### 7.3. Backend (Windows)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # если ошибка ExecutionPolicy — см. раздел 15.3
pip install -U pip
pip install -r requirements.txt
copy .env.example .env           # затем откройте .env и заполните
```

PostgreSQL через Docker Desktop:
```powershell
docker run --name tiscord-postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_DB=tiscord `
  -p 5432:5432 -d postgres:16
```

Миграции и запуск:
```powershell
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 7.4. Frontend (Windows)
```powershell
cd ..\desktop
npm install
npm run dev
```

Открыть: http://localhost:1420

---

## 8. Сборка Desktop-приложения (.exe) с Tauri

Tauri позволяет упаковать веб-интерфейс в нативное десктопное приложение (.exe на Windows, .dmg на macOS, .AppImage на Linux).

### 8.1. Установить зависимости

**Rust (все ОС):**
```bash
# Linux/macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Windows (PowerShell)
winget install --id Rustlang.Rustup
# или скачать rustup-init.exe с https://rustup.rs и запустить
```

**Системные библиотеки (только Linux):**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  build-essential curl wget file libxdo-dev libgtk-3-dev
```

**WebView2 (только Windows):** уже установлен через Microsoft Edge.
Если нет — скачать: https://developer.microsoft.com/microsoft-edge/webview2/

### 8.2. Инициализировать Tauri в проекте

> Выполнять **один раз** — создаёт папку `src-tauri/` с конфигурацией.

```bash
cd desktop
npm install            # установить зависимости, включая @tauri-apps/cli
npm run tauri init
```

Ответьте на вопросы инициализации:

| Вопрос | Ответ |
|--------|-------|
| What is your app name? | `Tiscord` |
| What should the window title be? | `Tiscord` |
| Where are your web assets (HTML/CSS/JS)? | `../dist` |
| What is the URL of your dev server? | `http://localhost:1420` |
| What is your frontend dev command? | `npm run dev` |
| What is your frontend build command? | `npm run build` |

### 8.3. Сборка .exe (Windows) / .dmg (macOS) / .AppImage (Linux)

```bash
cd desktop
npm run tauri:build
```

Бинарный файл появится в:
- **Windows**: `desktop/src-tauri/target/release/bundle/msi/*.msi`
  и/или `desktop/src-tauri/target/release/tiscord.exe`
- **macOS**: `desktop/src-tauri/target/release/bundle/dmg/*.dmg`
- **Linux**: `desktop/src-tauri/target/release/bundle/appimage/*.AppImage`

### 8.4. Настройка API URL в .exe-сборке

До сборки создайте `desktop/.env.production`:
```env
VITE_API_URL=https://<your-app>.up.railway.app
VITE_WS_URL=wss://<your-app>.up.railway.app/ws
```

Замените `<your-app>` на реальный домен Railway (см. раздел 9).

### 8.5. Полный сценарий "с нуля до .exe"

```bash
# 1. Установить Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && source $HOME/.cargo/env

# 2. Установить Node.js-зависимости
cd desktop && npm install

# 3. Инициализировать Tauri (один раз)
npm run tauri init

# 4. Прописать URL задеплоенного backend
echo "VITE_API_URL=https://<your-app>.up.railway.app" > .env.production
echo "VITE_WS_URL=wss://<your-app>.up.railway.app/ws" >> .env.production

# 5. Собрать
npm run tauri:build
```

---

## 9. Деплой Backend на Railway

Railway автоматически использует `backend/Dockerfile` и `backend/railway.toml`.
При запуске контейнер **автоматически прогоняет миграции**, затем стартует сервер.

### 9.1. Создать проект и подключить GitHub

1. Зайдите на https://railway.app → **New Project**
2. **Deploy from GitHub repo** → выберите `YuriiFridman/Tiscord`
3. В настройках сервиса укажите **Root Directory**: `backend`

Railway обнаружит `Dockerfile` и `railway.toml` автоматически.

### 9.2. Настроить переменные окружения

В Railway → backend service → **Variables** добавьте:

| Переменная | Значение |
|------------|---------|
| `JWT_SECRET` | Случайная строка 32+ символа (сгенерировать: `openssl rand -hex 32`) |
| `DATABASE_URL` | Из Postgres-сервиса Railway (см. раздел 10) |
| `CORS_ORIGINS` | Домен фронтенда (например `https://tiscord.vercel.app`) |
| `STORAGE_BACKEND` | `local` (dev) или `s3` (prod, рекомендуется) |

> `PORT` Railway выставляет автоматически — не добавляйте его вручную.

### 9.3. Деплой

После сохранения переменных Railway запустит сборку и деплой.
Готовность: GET `https://<app>.up.railway.app/health` → `{"status":"ok"}`

---

## 10. Деплой PostgreSQL на Railway

### 10.1. Добавить базу данных

В проекте Railway: **New** → **Database** → **PostgreSQL**

Railway создаст отдельный сервис и добавит `DATABASE_URL` в его переменные.

### 10.2. Подключить к Backend

В Railway → backend service → Variables → добавьте:
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Используйте ссылку-переменную Railway (`${{...}}`), чтобы значение обновлялось автоматически.

> Приложение само конвертирует `postgres://...` в `postgresql+asyncpg://...` —
> дополнительного редактирования URL не нужно.

### 10.3. Миграции

Миграции запускаются **автоматически** при каждом деплое (через `CMD` в `Dockerfile`).
Для ручного запуска (локально, с удалённой БД):

```bash
DATABASE_URL=postgresql+asyncpg://... alembic upgrade head
```

---

## 11. Деплой Frontend (Vercel / Netlify / Railway)

### Вариант A — Vercel (рекомендуется)

1. Зайдите на https://vercel.com → **New Project** → импортируйте репозиторий
2. Укажите:
   - **Root Directory**: `desktop`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Добавьте **Environment Variables**:
   ```
   VITE_API_URL=https://<your-backend>.up.railway.app
   VITE_WS_URL=wss://<your-backend>.up.railway.app/ws
   ```
4. **Deploy** — Vercel выдаст HTTPS-домен.

### Вариант B — Netlify

1. https://netlify.com → **Add new site** → **Import an existing project**
2. **Base directory**: `desktop`
3. **Build command**: `npm run build`
4. **Publish directory**: `desktop/dist`
5. Environment variables — те же, что в Варианте A.

### Вариант C — Второй сервис на Railway

В Railway → **New Service** → GitHub → тот же репозиторий.

Настройки:
- **Root Directory**: `desktop`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npx serve -s dist -l $PORT`

Environment Variables:
```
VITE_API_URL=https://<backend-service>.up.railway.app
VITE_WS_URL=wss://<backend-service>.up.railway.app/ws
```

---

## 12. Настройка домена, HTTPS, CORS

### HTTPS
Railway автоматически выдаёт HTTPS на домене `*.up.railway.app`.

### CORS
После того как узнаете домен фронтенда, обновите в Railway → backend Variables:
```
CORS_ORIGINS=https://your-frontend.vercel.app
```

Несколько доменов — через запятую:
```
CORS_ORIGINS=https://your-frontend.vercel.app,https://your-custom-domain.com
```

> Не используйте `*` в продакшене — это небезопасно.

---

## 13. WebSocket и звонки (STUN/TURN)

```env
STUN_URLS=stun:stun.l.google.com:19302
```

Для стабильных голосовых звонков через NAT рекомендуется TURN-сервер:
```env
TURN_URL=turn:your-turn-server.com:3478
TURN_USER=username
TURN_PASS=password
```

Бесплатные TURN-серверы: https://www.metered.ca/tools/openrelay/

---

## 14. Миграции БД (Alembic)

```bash
cd backend
source .venv/bin/activate   # или .\.venv\Scripts\Activate.ps1 на Windows

# Применить все миграции
alembic upgrade head

# Откатить последнюю
alembic downgrade -1

# Создать новую миграцию (после изменения моделей)
alembic revision --autogenerate -m "describe change"
```

---

## 15. Troubleshooting

### 15.1. Railway: сервис запускается, но возвращает 502

Убедитесь, что в `backend/Dockerfile` последняя строка содержит `${PORT:-8000}`:
```dockerfile
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```
Railway маршрутизирует трафик только на порт из переменной `PORT`.

### 15.2. Ошибка подключения к БД

- Убедитесь, что `DATABASE_URL` в backend Variables указывает на Railway Postgres.
- Проверьте ссылку-переменную: `${{Postgres.DATABASE_URL}}`.
- URL автоматически конвертируется — ничего менять не нужно.

### 15.3. Windows: не активируется venv (ExecutionPolicy)

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\.venv\Scripts\Activate.ps1
```

### 15.4. Vite: порт 1420 занят

```bash
# Освободить порт или поменять в desktop/vite.config.ts:
# server: { port: 3000, strictPort: true }
```

### 15.5. Tauri build: ошибка "failed to bundle"

- Убедитесь, что Rust установлен: `rustc --version`
- Выполните `npm run tauri init` перед `tauri:build` (папка `src-tauri` должна существовать)
- На Linux — установите системные библиотеки из раздела 8.1

### 15.6. CORS-ошибки в браузере

Установите в Railway Variables:
```
CORS_ORIGINS=https://your-frontend-domain.com
```
Перезапустите деплой.
