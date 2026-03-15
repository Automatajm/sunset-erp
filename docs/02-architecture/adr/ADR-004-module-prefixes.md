# ADR-004: Database Table Module Prefixes

**Status:** ✅ Accepted  
**Date:** 2026-03-14  
**Deciders:** Juan Mendoza  
**Tags:** database, naming, organization

---

## CONTEXT

With 150+ tables planned across multiple modules, we need a clear naming strategy to:
- Identify which module owns which table
- Navigate the database easily
- Enable team collaboration
- Support modular development

Prisma doesn't support PostgreSQL schemas for organization, so we need an alternative.

---

## DECISION

**Use module prefixes for all table names.**

Format: `{module_prefix}_{table_name}`

**Prefix Standard:**
- `saas_` - SaaS core (tenants, billing)
- `auth_` - Authentication (users, roles)
- `mc_` - Multi-currency
- `i18n_` - Internationalization
- `po_` - Procurement (purchase orders)
- `in_` - Inventory
- `mfg_` - Manufacturing
- `so_` - Sales orders
- `ac_` - Accounting
- `fn_` - Finance
- `dist_` - Distribution
- `maint_` - Maintenance

**Examples:**
- `po_suppliers`
- `in_items`
- `mfg_boms`
- `so_customers`

---

## CONSEQUENCES

### Positive

1. **Visual Organization** - Instant recognition of table ownership
2. **Team Collaboration** - Clear module boundaries
3. **Database Navigation** - Easy to find related tables
4. **Permissions** - Simpler to grant module-specific access
5. **Documentation** - Auto-group by module in ERD
6. **Debugging** - Quickly identify which module has issues

### Negative

1. **Longer Names** - `po_purchase_orders` vs `purchase_orders`
2. **Extra Typing** - Slightly more verbose
3. **Migration Effort** - If we change prefix standard later

---

## ALTERNATIVES CONSIDERED

### Alternative 1: PostgreSQL Schemas
**Why not:** Prisma doesn't support multi-schema well

### Alternative 2: No Prefixes
**Why not:** 150+ tables would be chaotic

### Alternative 3: Full Module Name
**Why not:** Too verbose (`procurement_suppliers`)

---

## IMPLEMENTATION NOTES

```prisma
model Supplier {
  // ...
  @@map("po_suppliers")  // Maps to table with prefix
}
```

---

## RELATED DECISIONS

- ADR-003: PostgreSQL with Prisma

---

**Review Date:** Never (unlikely to change)