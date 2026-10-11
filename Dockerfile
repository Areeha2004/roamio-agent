# Roamio backend — FastAPI + LangGraph planning agent.
# Build:  docker build -t roamio-api .
# Run:    docker run -p 8000:8000 --env-file .env roamio-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Dependencies first, so code changes don't invalidate the pip layer.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Only what the server needs at runtime — evals, frontend and scratch stay out.
COPY api/ api/
COPY agent/ agent/
COPY rag/ rag/
COPY tools/ tools/
COPY db/ db/
COPY corpus/ corpus/

# Run as non-root. /app stays writable because Chroma builds its index into /app/chroma
# on the first request (see DEPLOY.md).
RUN useradd --create-home roamio && chown -R roamio /app
USER roamio

EXPOSE 8000
# Shell form so Render/Railway's $PORT is honoured; defaults to 8000 locally.
CMD uvicorn api.main:app --host 0.0.0.0 --port $PORT
