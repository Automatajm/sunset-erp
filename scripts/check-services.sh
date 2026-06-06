#!/usr/bin/env bash
# Service preflight for `pnpm dev` — WARNS if PostgreSQL/Redis are down but never
# starts them (systemd/service owns them) and never blocks the dev servers.

# PostgreSQL (:5432)
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -q 2>/dev/null; then
    echo "PostgreSQL: up (:5432)"
  else
    echo "WARN: PostgreSQL is NOT running — backend will fail to connect."
    echo "      Start it yourself: sudo service postgresql start"
  fi
else
  echo "WARN: pg_isready not found — cannot check PostgreSQL (:5432)."
fi

# Redis (:6379) — permission cache is fail-open, auth works without it
if command -v redis-cli >/dev/null 2>&1; then
  if [ "$(redis-cli ping 2>/dev/null)" = "PONG" ]; then
    echo "Redis: up (:6379)"
  else
    echo "WARN: Redis is NOT running (permission cache is fail-open; auth still works)."
    echo "      Start it yourself: sudo service redis-server start"
  fi
else
  echo "WARN: redis-cli not found — cannot check Redis (:6379)."
fi

exit 0
