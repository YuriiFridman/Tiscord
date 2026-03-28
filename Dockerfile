# ── Stage 1: Build the Vite / React frontend ─────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Install dependencies first (better layer caching)
COPY desktop/package*.json ./
RUN npm ci

# Copy source and build.
# VITE_API_URL / VITE_WS_URL are intentionally left empty so the frontend
# uses *relative* paths (/api/v1/…).  The FastAPI backend that serves this
# build is reachable at the same origin, so relative paths resolve correctly.
COPY desktop/ ./
ENV VITE_API_URL=""
ENV VITE_WS_URL=""
RUN npm run build

# ── Stage 2: Python backend that embeds and serves the frontend ────────────────
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy the compiled frontend so main.py can serve it as static files.
COPY --from=frontend-builder /frontend/dist ./frontend_dist

ENV PYTHONPATH=/app

# Railway injects $PORT at runtime; fall back to 8000 for local Docker usage.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
