# --- Stage 1: build the frontend ---
FROM node:20-alpine AS web-builder
WORKDIR /web
# pnpm versión pineada al `packageManager` del package.json — evita drift entre
# dev local, CI y la imagen Docker.
RUN npm install -g pnpm@10.33.4
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# --- Stage 2: runtime ---
FROM python:3.12-slim

# openssh-client para casos donde asyncssh necesita helpers (ssh-keyscan, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=web-builder /web/dist ./web/dist

# Volúmenes para datos persistentes: DB + claves SSH generadas in-app
RUN mkdir -p /app/data /root/.sshpanel/keys && chmod 700 /root/.sshpanel/keys

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/health || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
