#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# clean-e2e-residue.sh — remove the data the e2e suites leave behind.
#
# The e2e suites (backend/test/*.e2e-spec.ts) create fixtures in the DEMO
# tenant plus throwaway "E2E Tenant" rows and e2e-* users, and do NOT clean
# up after themselves. Run this before a demo so Settings → Tenants/Users and
# the DEMO tenant look pristine.
#
# Scope — strictly limited to:
#   1. ALL business rows of the DEMO tenant (auth/roles/settings kept).
#   2. Tenants whose code/name matches E2E patterns, with all their rows.
#   3. Users whose email contains "e2e".
# BURGER (and any other tenant) is never touched.
#
# ⚠️ Do NOT "restore" anything afterward with `pnpm seed` unless you intend a
# full reset: seed.ts TRUNCATEs every table CASCADE first (see CLAUDE.md).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/../backend"
DB_URL=$(grep '^DATABASE_URL' .env | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$DB_URL" ] || { echo "DATABASE_URL not found in backend/.env"; exit 1; }

q() { psql "$DB_URL" -t -A -c "$1"; }

DEMO_ID=$(q "SELECT id FROM saas_tenants WHERE code='DEMO';")
[ -n "$DEMO_ID" ] || { echo "DEMO tenant not found — nothing to do"; exit 0; }

KEEP="auth_roles auth_user_roles auth_user_tenants cfg_tenant_settings"
TABLES=$(q "SELECT table_name FROM information_schema.columns
            WHERE column_name='tenant_id' AND table_schema='public';")

wipe_tenant_rows() { # $1 = tenant id, $2 = respect KEEP (yes|no)
  local tid=$1 keep=$2 pass blocked out t
  for pass in 1 2 3 4 5 6; do
    blocked=0
    for t in $TABLES; do
      if [ "$keep" = yes ]; then case " $KEEP " in *" $t "*) continue ;; esac; fi
      out=$(psql "$DB_URL" -t -A -c "DELETE FROM \"$t\" WHERE tenant_id='$tid';" 2>&1) \
        || true
      [[ "$out" == *ERROR* ]] && blocked=$((blocked + 1))
    done
    [ "$blocked" -eq 0 ] && return 0
  done
  echo "WARN: some tables still blocked for tenant $tid after 6 passes"
}

echo "1/3 Wiping DEMO business rows (auth/config kept)…"
wipe_tenant_rows "$DEMO_ID" yes

echo "2/3 Removing E2E tenants…"
for TID in $(q "SELECT id FROM saas_tenants
                WHERE code ILIKE '%e2e%' OR name ILIKE '%e2e%' OR code LIKE 'EETE%';"); do
  wipe_tenant_rows "$TID" no
  psql "$DB_URL" -q -c "DELETE FROM saas_tenants WHERE id='$TID';"
done

echo "3/3 Removing e2e users…"
psql "$DB_URL" -q -c "DELETE FROM auth_user_tenants WHERE user_id IN
  (SELECT id FROM auth_users WHERE email ILIKE '%e2e%');"
psql "$DB_URL" -q -c "DELETE FROM auth_users WHERE email ILIKE '%e2e%';"

echo "Done. Tenants now: $(q "SELECT string_agg(code, ', ' ORDER BY code) FROM saas_tenants;")"
