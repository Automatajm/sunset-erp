# ADR-001: Use Modular Monolith Architecture

**Status:** ✅ Accepted  
**Date:** 2026-03-14  
**Deciders:** Juan Mendoza, Development Team  
**Tags:** architecture, scalability, deployment

---

## CONTEXT

Sunset ERP needs to decide on the overall system architecture. The main options are:

1. **Microservices** - Distributed system with independent services
2. **Modular Monolith** - Single deployable unit with clear module boundaries
3. **Traditional Monolith** - Single codebase without strong module boundaries

Key considerations:
- Time to market (9-month MVP target)
- Team size (small initially)
- Complexity vs maintainability
- Infrastructure costs
- Ability to scale later

---

## DECISION

**We will use a Modular Monolith architecture for the MVP.**

The system will be:
- Single deployable unit (one Docker container initially)
- Clear module boundaries (NestJS modules)
- Shared database with proper isolation
- Can be split into microservices later if needed

**Module Structure:**
```
- auth.module (Authentication)
- tenants.module (Tenant management)
- billing.module (Subscriptions)
- procurement.module (Purchase orders)
- inventory.module (Stock management)
- sales.module (Sales orders)
- manufacturing.module (Production)
- accounting.module (Financial)
```

Each module is self-contained with its own:
- Controllers
- Services
- DTOs
- Database models (via Prisma)

---

## CONSEQUENCES

### Positive

1. **Faster Development**
   - No network overhead between modules
   - Easier debugging (all in one process)
   - Simpler deployment (single container)
   - Faster iteration cycles

2. **Lower Complexity**
   - No distributed system challenges
   - No service discovery needed
   - No API versioning between services
   - Single database transactions (ACID)

3. **Cost Efficiency**
   - Lower infrastructure costs
   - Fewer resources needed
   - Simpler monitoring setup

4. **Team Productivity**
   - Easier onboarding for new developers
   - Less cognitive overhead
   - Familiar development patterns

5. **Future Flexibility**
   - Can extract modules to microservices later
   - Module boundaries already defined
   - Database can be split if needed

### Negative

1. **Scaling Limitations**
   - Cannot scale individual modules independently
   - Must scale entire application
   - Resource-intensive modules affect others

2. **Technology Lock-in**
   - All modules must use same technology stack
   - Cannot use different languages per module
   - Framework updates affect entire system

3. **Deployment Coupling**
   - All modules deployed together
   - Cannot deploy modules independently
   - Longer deployment time as system grows

4. **Potential for Tight Coupling**
   - Requires discipline to maintain boundaries
   - Easy to create dependencies between modules
   - Can become a "big ball of mud" without governance

### Neutral

1. **Database Strategy**
   - Single database (pro: simpler, con: single point of failure)
   - Requires good connection pooling

2. **Module Communication**
   - Direct function calls (fast but coupled)
   - Event-driven possible within monolith

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Microservices Architecture

**Description:** Separate service per module, each with its own database

**Pros:**
- Independent scaling per service
- Technology diversity possible
- Independent deployment
- Team autonomy per service
- Fault isolation

**Cons:**
- Much higher complexity
- Network latency between services
- Distributed transactions difficult
- More infrastructure needed
- Slower development initially
- Higher operational overhead
- Need for service mesh, API gateway

**Why not chosen:**
- Premature for MVP
- Small team cannot manage complexity
- Adds 3-6 months to timeline
- Higher costs ($500+/month vs $50/month)
- Benefits not needed at <10,000 tenants

**Industry Examples:**
- NetSuite started as monolith
- Shopify started as monolith
- GitHub started as monolith

### Alternative 2: Traditional Monolith

**Description:** Single codebase without strong module boundaries

**Pros:**
- Simplest to build initially
- Fast development
- Easy deployment

**Cons:**
- Hard to maintain as grows
- Tight coupling inevitable
- Difficult to test
- Cannot extract to microservices later
- Team conflicts increase

**Why not chosen:**
- We need clean boundaries for future scalability
- Want option to extract modules later
- Team needs clear ownership

---

## IMPLEMENTATION NOTES

### NestJS Module Organization

```typescript
@Module({
  imports: [
    // Module dependencies
    PrismaModule,
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService], // Only if needed by other modules
})
export class ProcurementModule {}
```

### Module Communication Rules

1. **Direct Imports:** Modules can import exported services from other modules
2. **Events:** Use EventEmitter for async communication
3. **Shared Services:** Common services (logger, cache) in shared module
4. **No Database Access:** Modules must not access other module's tables directly

### Future Extraction Plan

If/when we need microservices (at ~10,000 tenants):

1. **Phase 1:** Extract billing module (different scaling needs)
2. **Phase 2:** Extract reporting (read-heavy)
3. **Phase 3:** Extract heavy modules (manufacturing, inventory)

Each extraction:
- Replace direct calls with HTTP/gRPC
- Split database tables
- Set up message queue (RabbitMQ/Kafka)

---

## RELATED DECISIONS

- ADR-002: Shared Database Multi-Tenancy
- ADR-003: PostgreSQL with Prisma ORM
- ADR-005: NestJS for Backend Framework
- ADR-011: Docker for Deployment

---

## REFERENCES

- [Martin Fowler - Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)
- [NestJS Modules Documentation](https://docs.nestjs.com/modules)
- [Sam Newman - Monolith to Microservices](https://samnewman.io/books/monolith-to-microservices/)
- [Shopify Engineering - Monolith Architecture](https://shopify.engineering/shopify-monolith)

---

**Review Date:** September 2026 (after MVP launch)  
**Success Criteria:** 
- MVP launched in 9 months
- Can support 1,000 tenants
- Modules remain decoupled
- Team velocity remains high