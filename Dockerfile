# ──────────────────────────────────────────────────────────────────────
# Stage 1 — build the AXL Go binary (gensyn-ai/axl).
# ──────────────────────────────────────────────────────────────────────
FROM golang:1.25-bookworm AS axl-builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 https://github.com/gensyn-ai/axl.git /src/axl
WORKDIR /src/axl
RUN go build -o /out/node ./cmd/node/

# ──────────────────────────────────────────────────────────────────────
# Stage 2 — Sibyl runtime.
# ──────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# AXL binary from the builder stage. Our CLI's findAxlBinary() picks this up
# from $SIBYL_AXL_BINARY first, so we don't need it on $PATH.
COPY --from=axl-builder /out/node /opt/sibyl/node
ENV SIBYL_AXL_BINARY=/opt/sibyl/node

# Identity + AXL config live in $SIBYL_HOME; mount a Railway volume here if
# you want a stable peer ID across redeploys (otherwise it regenerates).
ENV SIBYL_HOME=/app/.sibyl

# Install deps first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest. .dockerignore keeps node_modules / web / .env / data out.
COPY . .

# Defense-in-depth: disable the loopback-only control endpoint at the
# observer layer in production. (Inbound on Railway comes via a non-loopback
# proxy IP, so the existing check already rejects, but this is explicit.)
ENV SIBYL_DISABLE_CONTROL=1

# observePort() falls back to $PORT (Railway-provided) if SIBYL_OBSERVE_PORT
# isn't set explicitly. EXPOSE is informational; Railway uses $PORT.
EXPOSE 9099

# Idempotent — `init` is a no-op if SIBYL_HOME already has an identity.
CMD ["sh", "-c", "./bin/sibyl init && exec ./bin/sibyl run --mode mock --tick-ms 5000"]
