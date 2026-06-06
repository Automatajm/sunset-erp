#!/usr/bin/env bash
# Service preflight for `pnpm dev` — WARNS if PostgreSQL/Redis are down but never
# starts them (systemd/service owns them). Service checks never block; the WSL
# memory-cap check DOES block (an uncapped VM froze the whole host twice, 2026-06-06).

# ── WSL memory caps ──
# .wslconfig (5GB RAM / 6GB swap) only takes effect after `wsl --shutdown`.
# If the VM is running with WSL defaults (~6GB RAM / 2GB swap on this 8GB host),
# starting both dev servers starves Windows and freezes the machine — refuse.
mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
swap_total_kb=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
if [ "${mem_total_kb:-0}" -gt 5500000 ] || [ "${swap_total_kb:-0}" -lt 4000000 ]; then
  echo "BLOCKED: WSL is running WITHOUT the .wslconfig memory caps."
  echo "         Current: RAM $((mem_total_kb / 1024))MB / swap $((swap_total_kb / 1024))MB — expected ~5GB RAM / 6GB swap."
  echo "         This exact state froze the host on 2026-06-06 (twice)."
  echo ""
  echo "         Fix: save your work, then from Windows PowerShell run:"
  echo "             wsl --shutdown"
  echo "         and reopen the terminal. (Editing .wslconfig alone does nothing.)"
  echo ""
  echo "         Override at your own risk: DEV_ALLOW_UNCAPPED=1 pnpm dev"
  if [ -z "$DEV_ALLOW_UNCAPPED" ]; then
    exit 1
  fi
  echo "WARN: DEV_ALLOW_UNCAPPED set — continuing on an uncapped VM."
fi

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
