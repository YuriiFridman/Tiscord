# Tiscord

Tiscord — Discord-подобное приложение, состоящее из:
- **Backend**: FastAPI (Python 3.11+), WebSocket `/ws`, REST API с префиксом `/api/v1`.
- **Desktop/Frontend**: Vite + React + TypeScript (папка `desktop`). Также есть скрипты для **Tauri** (desktop build).

Этот README максимально подробно описывает:
- запуск **локально** (в т.ч. **Windows**),
- деплой на **Railway** (backend + PostgreSQL),
- сборку и публикацию фронтенда.

---

## Содержание

- [1. Требования](#1-требования)
- [2. Структура репозитория](#2-структура-репозитория)
- [3. Локальный запуск (быстрый старт)](#3-локальный-запуск-быстрый-старт)
- [4. Переменные окружения Backend (.env)](#4-переменные-окружения-backend-env)
- [5. Запуск Backend локально](#5-запуск-backend-локально)
- [6. Запуск Frontend локально (Vite)](#6-запуск-frontend-локально-vite)
- [7. Локальный запуск на Windows (очень подробно)](#7-локальный-запуск-на-windows-очень-подробно)
- [8. Деплой Backend на Railway (пошагово)](#8-деплой-backend-на-railway-пошагово)
- [9. Деплой PostgreSQL на Railway + подключение](#9-деплой-postgresql-на-railway--подключение)
- [10. Настройка домена, HTTPS, CORS на Railway](#10-настройка-домена-https-cors-на-railway)
- [11. Статика/Frontend: варианты деплоя](#11-статикfrontend-варианты-деплоя)
- [12. WebSocket и звонки (STUN/TURN)](#12-websocket-и-звонки-stunturn)
- [13. Миграции БД (Alembic)](#13-миграции-бд-alembic)
- [14. Troubleshooting](#14-troubleshooting)

---

## 1. Требования

### Для локальной разработки (macOS/Linux)
- Git
- Python **3.11+**
- Node.js **18+** (лучше 20 LTS)
- PostgreSQL **14+** (или через Docker)

### Для Windows
- Git for Windows
- Python **3.11+** (через официа��ьный установщик)
- Node.js **18+**
- Один из вариантов для БД:
  - PostgreSQL локально **или**
  - Docker Desktop (и PostgreSQL в контейнере)

---

## 2. Структура репозитория

- `backend/` — FastAPI приложение
  - `backend/app/main.py` — вход FastAPI (`app`)
  - `backend/app/config.py` — настройки через env
  - `backend/app/database.py` — SQLAlchemy async engine
  - `backend/requirements.txt` — зависимости Python
  - `backend/Dockerfile` — Docker образ backend
  - `backend/alembic.ini`, `backend/alembic/` — миграции
- `desktop/` — Vite/React приложение
  - `desktop/package.json` — npm scripts
  - `desktop/vite.config.ts` — Vite config (порт dev-сервера **1420**)
  - `desktop/src/` — исходники

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
```

Создайте `backend/.env` (см. раздел 4), затем:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3.3. Frontend (Linux/macOS/Windows)
В новом терминале:
```bash
cd desktop
npm install
npm run dev
```

---

## 4. Переменные окружения Backend (.env)

Backend читает переменные из **`backend/.env`** (см. `backend/app/config.py`).

Создайте файл `backend/.env`:

```env
# ======================
# Database (PostgreSQL)
# ======================
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/tiscord

# ======================
# JWT (ОБЯЗАТЕЛЬНО поменять в проде)
# ======================
JWT_SECRET=changeme-in-production
JWT_ACCESS_EXPIRE_MINUTES=60
JWT_REFRESH_EXPIRE_DAYS=30

# ======================
# File storage
# ======================
# local | s3
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./uploads

# Для STORAGE_BACKEND=s3:
STORAGE_S3_BUCKET=
STORAGE_S3_ENDPOINT=
STORAGE_S3_ACCESS_KEY=
STORAGE_S3_SECRET_KEY=
STORAGE_S3_REGION=auto

# ======================
# Voice / WebRTC
# ======================
STUN_URLS=stun:stun.l.google.com:19302
TURN_URL=
TURN_USER=
TURN_PASS=

# ======================
# Upload limits
# ======================
MAX_ATTACHMENT_SIZE=8388608

# ======================
# CORS
# ======================
# В dev можно "*", в prod лучше конкретные домены через запятую
CORS_ORIGINS=*
```

---

## 5. Запуск Backend локально

### 5.1. Подготовка PostgreSQL (варианты)

#### Вариант A: PostgreSQL установлен локально
1) Создайте базу `tiscord`.
2) Обновите `DATABASE_URL` в `backend/.env`.

Пример:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tiscord
```

#### Вариант B: PostgreSQL в Docker
```bash
docker run --name tiscord-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=tiscord \
  -p 5432:5432 \
  -d postgres:16
```

И в `backend/.env`:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tiscord
```

### 5.2. Миграции (если настроены)
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### 5.3. Запуск сервера
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Полезные URL:
- Health: `http://127.0.0.1:8000/health`
- Swagger: `http://127.0.0.1:8000/docs`
- WS: `ws://127.0.0.1:8000/ws?token=...`

---

## 6. Запуск Frontend локально (Vite)

```bash
cd desktop
npm install
npm run dev
```

Dev URL (порт задан в `vite.config.ts`):
- `http://localhost:1420`

### Важно про API URL во фронте
Vite настроен на переменные с префиксом `VITE_`.  
Если во фронте используется базовый URL API через env (часто это `VITE_API_URL`), создайте:

`desktop/.env.local`
```env
VITE_API_URL=http://127.0.0.1:8000
```

> Точное имя переменной зависит от того, как это реализовано в `desktop/src`. Если скажешь/покажешь файл где создаётся клиент API — я приведу 100% точную инструкцию.

---

## 7. Локальный запуск на Windows (очень подробно)

Ниже инструкция рассчитана на Windows 10/11.

### 7.1. Установить инструменты

#### 7.1.1. Git for Windows
- Установите Git (обычно ставят вместе Git Bash).
- После установки откройте **Git Bash** или **PowerShell**.

#### 7.1.2. Python 3.11+
- Скачайте Python 3.11+ с официального сайта.
- В установщике обязательно отметьте:
  - **Add python.exe to PATH**
  - (желательно) **Install pip**

Проверка в PowerShell:
```powershell
python --version
pip --version
```

#### 7.1.3. Node.js
- Ставьте Node.js 18+ (лучше 20 LTS)
Проверка:
```powershell
node -v
npm -v
```

#### 7.1.4. PostgreSQL (выберите один вариант)
**Вариант A (рекомендовано для новичков): Docker Desktop + контейнер Postgres**  
**Вариант B: PostgreSQL локально** (через installer)

---

### 7.2. Клонировать репозиторий (Windows)
В PowerShell:
```powershell
git clone https://github.com/YuriiFridman/Tiscord.git
cd Tiscord
```

---

### 7.3. Backend на Windows (venv + зависимости)

Перейдите в `backend`:
```powershell
cd backend
```

Создайте виртуальное окружение:
```powershell
python -m venv .venv
```

Активируйте venv:

**PowerShell:**
```powershell
.\.venv\Scripts\Activate.ps1
```

Если PowerShell ругается на ExecutionPolicy, выполните (один раз):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
И снова активируйте venv.

Обновите pip и установите зависимости:
```powershell
python -m pip install -U pip
pip install -r requirements.txt
```

---

### 7.4. PostgreSQL на Windows (проще через Docker)

Если установлен Docker Desktop, в PowerShell:
```powershell
docker run --name tiscord-postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_DB=tiscord `
  -p 5432:5432 `
  -d postgres:16
```

Создайте файл `backend\.env` (в папке `backend`) и укажите:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tiscord
JWT_SECRET=dev-secret
CORS_ORIGINS=*
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./uploads
```

---

### 7.5. Миграции (если используются)
В том же терминале (venv активен):
```powershell
alembic upgrade head
```

---

### 7.6. Запуск backend на Windows
```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Проверка:
- `http://127.0.0.1:8000/health`

---

### 7.7. Frontend на Windows (npm)
В новом PowerShell окне:
```powershell
cd Tiscord\desktop
npm install
npm run dev
```

Откройте:
- `http://localhost:1420`

---

## 8. Деплой Backend на Railway (пошагово)

Railway удобен тем, что:
- можно подключить GitHub репозиторий,
- можно добавить PostgreSQL как сервис,
- можно задать переменные окружения,
- Railway даст публичный домен и HTTPS.

Ниже — инструкция “как обычно делают правильно”.

### 8.1. Подготовить проект к Railway (важные моменты)
1) **Backend должен слушать порт из переменной `PORT`**, которую Railway выставляет автоматически.
2) Нельзя хардкодить `--port 8000` в проде.
3) Нужна команда запуска, которая использует `$PORT`.

Сейчас в `backend/Dockerfile` порт захардкожен (`8000`). Для Railway можно сделать **без Dockerfile**, через “Start Command”, либо добавить конфиги. Ниже вариант **через Start Command**, без изменения репозитория.

---

### 8.2. Создать проект в Railway и подключить GitHub
1) Зайдите в Railway → **New Project**
2) Выберите **Deploy from GitHub repo**
3) Выберите репозиторий `YuriiFridman/Tiscord`
4) Важно: Railway по умолчанию пытается деплоить корень. Нам нужен **backend**:
   - В настройках сервиса найдите **Root Directory** / **Monorepo settings**
   - Укажите: `backend`

> В Railway интерфейс иногда меняется, но смысл один: сервис должен строиться из папки `backend`.

---

### 8.3. Настроить команду запуска (Start Command)
В Railway → ваш сервис backend → Settings → Start Command укажите:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Это критично: Railway маршрутизирует трафик на порт, который он выдал в `PORT`.

---

### 8.4. Настроить переменные окружения (Variables)
В Railway → backend service → Variables добавьте минимум:

**Обязательно:**
- `JWT_SECRET` = длинная случайная строка (минимум 32+ символа)
- `CORS_ORIGINS` = домен фронтенда (см. раздел 10)
- `DATABASE_URL` = строка подключения к Railway Postgres (см. следующий раздел)

**Рекомендуется:**
- `STORAGE_BACKEND` = `local` или `s3`

> В продакшене **не используйте** дефолт `JWT_SECRET=changeme-in-production`.

---

### 8.5. Деплой
После указания Root Directory + Start Command + Variables Railway сделает build и deploy.

Проверка:
- Railway выдаст URL вида `https://<something>.up.railway.app`
- Откройте:
  - `https://<...>/health`

---

## 9. Деплой PostgreSQL на Railway + подключение

### 9.1. Добавить PostgreSQL
В Railway в проекте:
1) **New** → **Database** → **PostgreSQL**
2) Railway создаст отдельный сервис Postgres.

### 9.2. Получить DATABASE_URL
Обычно Railway предоставляет переменные подключения (в Postgres service → Variables), среди них будет `DATABASE_URL` или параметры host/user/password/dbname.

Вам нужно, чтобы в backend service была переменная:

- `DATABASE_URL=postgresql+asyncpg://...`

Важно: SQLAlchemy async требует драйвер `asyncpg`, поэтому схема должна быть:
- `postgresql+asyncpg://user:pass@host:port/dbname`

Если Railway даёт URL в формате `postgresql://...`, замените префикс на:
- `postgresql+asyncpg://...`

Пример:
- было: `postgresql://user:pass@host:5432/db`
- надо: `postgresql+asyncpg://user:pass@host:5432/db`

### 9.3. Миграции на Railway
Есть 2 подхода:

**Подход A (простой): выполнить миграции вручную один раз**
- Локально (или в CI) выполнить миграции на удалённую БД, указав `DATABASE_URL` Railway.
- Способ зависит от того, как вы хотите “рулить” миграциями.

**Подход B (автоматический): миграции при старте**
- Обычно добавляют entrypoint/скрипт, который делает `alembic upgrade head`, затем запускает uvicorn.
- Это удобно, но нужно делать аккуратно (конкуренция при нескольких инстансах).

> Если хочешь, я предложу конкретный безопасный вариант под Railway (с учётом best practices).

---

## 10. Настройка домена, HTTPS, CORS на Railway

### 10.1. HTTPS
Railway автоматически даёт HTTPS на своём домене.

### 10.2. CORS
В `backend/app/main.py` значение `CORS_ORIGINS` делится по запятым.

Пример:
- фронтенд будет на `https://tiscord-web.vercel.app`
Тогда в Railway Variables у backend:
```env
CORS_ORIGINS=https://tiscord-web.vercel.app
```

Если несколько:
```env
CORS_ORIGINS=https://tiscord-web.vercel.app,https://your-custom-domain.com
```

**Не рекомендую** `*` в проде (только для dev).

---

## 11. Статик/Frontend: варианты деплоя

Так как фронтенд лежит в `desktop/` и это Vite:

### Вариант A (самый популярный): деплоить фронт отдельно (Vercel/Netlify/Cloudflare Pages)
1) Собрать:
```bash
cd desktop
npm ci
npm run build
```
2) Опубликовать `desktop/dist`.

Плюсы: проще, дешевле, CDN.

### Вариант B: тоже на Railway как отдельный сервис
- Создать второй сервис в Railway из папки `desktop`
- Build Command:
  ```bash
  npm ci && npm run build
  ```
- Start Command:
  - Нужен статический сервер (например `npx serve -s dist -l $PORT`), либо Railway Nixpacks сам поднимет.
  
> Если скажешь, где именно хочешь хостить фронт (Railway или Vercel), я допишу точные команды/настройки под твой выбор.

---

## 12. WebSocket и звонки (STUN/TURN)

В `.env`/Variables:
- `STUN_URLS` — можно оставить дефолт
- `TURN_*` — для реального продакшена часто нужен TURN сервер (иначе у части пользователей звонки не проходят через NAT)

---

## 13. Миграции БД (Alembic)

Команды (в `backend/`):
```bash
alembic upgrade head
alembic downgrade -1
alembic revision -m "message"
```

---

## 14. Troubleshooting

### 14.1. Railway: сервис запустился, но 502/не отвечает
Почти всегда причина: приложение слушает не тот порт.
- Убедитесь, что Start Command:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

### 14.2. Railway: ошибки подключения к БД
- Проверьте, что `DATABASE_URL` в backend service реально указывает на Railway Postgres
- Проверьте, что префикс `postgresql+asyncpg://...`

### 14.3. Windows: не активируется venv
- PowerShell ExecutionPolicy:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- Активировать:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```

### 14.4. Vite порт 1420 занят
Vite настроен на `strictPort: true`, поэтому упадёт. Освободите порт или поменяйте `server.port` в `desktop/vite.config.ts`.

---

## Уточняющие вопросы (чтобы довести README до “идеала”)
1) Фронтенд ты реально хочешь деплоить **тоже на Railway**, или лучше Vercel/Netlify?
2) Нужна ли инструкция именно для **Tauri-сборки** (desktop-приложение), или достаточно web-версии?
3) Миграции Alembic сейчас реально используются и есть `alembic/versions/*`? Если да — хочешь автоматический прогон миграций при деплое?

Скажи ответы — и я подправлю README под твой точный сценарий (без предположений).
