FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONPATH=/app
# Railway injects $PORT; fall back to 8000 for local Docker usage.
# Alembic uses PostgreSQL advisory locks, so running migrations here is safe
# even when Railway deploys multiple instances simultaneously.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
