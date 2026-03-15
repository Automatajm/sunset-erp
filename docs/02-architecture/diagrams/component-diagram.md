# NestJS Component Architecture - Component Diagram

```mermaid
graph TB
    subgraph "Sunset ERP - NestJS Application"
        subgraph "Entry Point"
            Main[main.ts<br/>Bootstrap Application]
            AppModule[AppModule<br/>Root Module]
        end

        subgraph "Core Modules"
            ConfigModule[ConfigModule<br/>Environment Variables]
            PrismaModule[PrismaModule<br/>Database Client]
            CacheModule[CacheModule<br/>Redis Client]
            AuthModule[AuthModule<br/>JWT Authentication]
        end

        subgraph "Shared Services"
            TenantMiddleware[TenantMiddleware<br/>Extract tenant_id from JWT]
            AuthGuard[AuthGuard<br/>Validate JWT tokens]
            PermissionGuard[PermissionGuard<br/>RBAC enforcement]
            PrismaService[PrismaService<br/>Database access]
            CacheService[CacheService<br/>Redis operations]
            EmailService[EmailService<br/>SendGrid integration]
            StorageService[StorageService<br/>S3 file operations]
        end

        subgraph "Business Modules"
            TenantModule[TenantModule<br/>Tenant management]
            UserModule[UserModule<br/>User management]
            RoleModule[RoleModule<br/>Role & permissions]
            
            ProcurementModule[ProcurementModule<br/>Purchase orders]
            InventoryModule[InventoryModule<br/>Stock management]
            SalesModule[SalesModule<br/>Sales orders]
            ManufacturingModule[ManufacturingModule<br/>Production]
            AccountingModule[AccountingModule<br/>GL & journals]
            BillingModule[BillingModule<br/>Subscriptions & invoices]
        end

        subgraph "Procurement Module Details"
            SupplierController[SupplierController<br/>REST endpoints]
            POController[POController<br/>REST endpoints]
            SupplierService[SupplierService<br/>Business logic]
            POService[POService<br/>Business logic]
        end

        subgraph "External Services"
            PostgreSQL[(PostgreSQL<br/>Primary Database)]
            Redis[(Redis<br/>Cache & Sessions)]
            S3[(AWS S3<br/>File Storage)]
            Stripe[Stripe API<br/>Payments]
            SendGrid[SendGrid API<br/>Email]
        end
    end

    %% Connections
    Main --> AppModule
    AppModule --> ConfigModule
    AppModule --> PrismaModule
    AppModule --> CacheModule
    AppModule --> AuthModule
    AppModule --> TenantModule
    AppModule --> ProcurementModule
    AppModule --> InventoryModule
    AppModule --> SalesModule

    %% Middleware & Guards
    AppModule --> TenantMiddleware
    AppModule --> AuthGuard
    AppModule --> PermissionGuard

    %% Shared Services
    PrismaModule --> PrismaService
    CacheModule --> CacheService
    PrismaService --> PostgreSQL
    CacheService --> Redis
    StorageService --> S3
    EmailService --> SendGrid
    BillingModule --> Stripe

    %% Procurement Module
    ProcurementModule --> SupplierController
    ProcurementModule --> POController
    ProcurementModule --> SupplierService
    ProcurementModule --> POService
    
    SupplierController --> SupplierService
    POController --> POService
    SupplierService --> PrismaService
    POService --> PrismaService
    
    SupplierController --> AuthGuard
    SupplierController --> PermissionGuard
    POController --> AuthGuard
    POController --> PermissionGuard

    %% Tenant Middleware applies globally
    TenantMiddleware --> PostgreSQL

    style Main fill:#e1f5ff
    style AppModule fill:#e1f5ff
    style PrismaService fill:#ffe1e1
    style CacheService fill:#ffe1e1
    style AuthGuard fill:#fff4e1
    style PermissionGuard fill:#fff4e1
    style TenantMiddleware fill:#fff4e1
    style PostgreSQL fill:#e1ffe1
    style Redis fill:#e1ffe1
```

## Module Responsibilities

### Core Modules

**ConfigModule**
- Load environment variables
- Validate configuration
- Provide typed config service

**PrismaModule**
- Database connection management
- Global Prisma client instance
- Transaction support

**CacheModule**
- Redis connection
- Cache operations
- Session storage

**AuthModule**
- JWT token generation/validation
- Password hashing (bcrypt)
- Login/logout endpoints
- Token refresh logic

### Shared Services

**TenantMiddleware**
```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    // Extract tenantId from JWT
    const tenantId = req.user?.tenantId;
    
    // Set PostgreSQL session variable
    await prisma.$executeRaw`SET app.tenant_id = ${tenantId}`;
    
    next();
  }
}
```

**AuthGuard**
```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Validate JWT token
    // Attach user to request
    return super.canActivate(context);
  }
}
```

**PermissionGuard**
```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    // Check if user has required permission
    // e.g., PROCUREMENT:CREATE
    const requiredPermissions = this.reflector.get(...);
    const user = context.switchToHttp().getRequest().user;
    
    return user.permissions.some(p => requiredPermissions.includes(p));
  }
}
```

### Business Modules

**ProcurementModule**
- Supplier CRUD
- Purchase Order CRUD
- PO approval workflow
- Goods receipt

**InventoryModule**
- Item master data
- Stock levels
- Stock movements
- Lot/serial tracking

**SalesModule**
- Customer CRUD
- Sales Order CRUD
- Order fulfillment
- Shipping

**ManufacturingModule**
- Bill of Materials (BOM)
- Production orders
- Work orders
- Material consumption

**AccountingModule**
- Chart of accounts
- Journal entries
- General ledger
- Financial reports

**BillingModule**
- Subscription management
- Invoice generation
- Payment processing (Stripe)
- Usage tracking

## Module Communication

### Direct Imports (Synchronous)
```typescript
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [POController],
  providers: [POService],
})
export class ProcurementModule {}

// POService can inject InventoryService
@Injectable()
export class POService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService
  ) {}
}
```

### Event-Based (Asynchronous)
```typescript
// Emit event
this.eventEmitter.emit('purchase_order.created', {
  poId: po.id,
  tenantId: po.tenantId,
});

// Listen to event (in another module)
@OnEvent('purchase_order.created')
handlePOCreated(payload: POCreatedEvent) {
  // Update analytics
  // Send notification
  // Trigger webhooks
}
```

## Dependency Injection

All services use NestJS dependency injection:

```typescript
@Injectable()
export class POService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly email: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}
}
```

**Benefits:**
- Testability (easy to mock dependencies)
- Loose coupling
- Lifecycle management
- Single responsibility

## Guard Application

```typescript
@Controller('procurement/purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class POController {
  
  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  async create(@Body() dto: CreatePODto) {
    // Guards execute before this
    // User is authenticated & authorized
    return this.poService.create(dto);
  }
}
```

**Execution Order:**
1. TenantMiddleware (sets tenant context)
2. JwtAuthGuard (validates JWT)
3. PermissionsGuard (checks RBAC)
4. Controller method executes

## Testing Strategy

**Unit Tests**
```typescript
describe('POService', () => {
  let service: POService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        POService,
        { provide: PrismaService, useValue: mockPrisma }
      ],
    }).compile();

    service = module.get<POService>(POService);
  });
});
```

**Integration Tests**
```typescript
describe('PO API (e2e)', () => {
  let app: INestApplication;
  
  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });
});
```