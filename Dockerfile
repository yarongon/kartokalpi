# Build frontend assets in a separate Node stage.
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/src/frontend

COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./
RUN npm run build


# Runtime image: Python only, with prebuilt frontend assets copied in.
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY data/*.csv ./data/
COPY src/backend/ ./src/backend/
COPY --from=frontend-builder /app/src/frontend/dist ./src/frontend/dist

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
