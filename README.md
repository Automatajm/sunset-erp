# 🚀 Sunset ERP

A modern, production-ready, multi-tenant SaaS ERP platform built with NestJS, TypeScript, and PostgreSQL.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)](https://www.postgresql.org/)

## 📋 Overview

Sunset ERP is a complete enterprise resource planning system designed for multi-tenant SaaS deployment. It provides comprehensive business management capabilities including procurement, sales, inventory management, and full manufacturing execution.

**🎯 Production Ready** - This is commercial-grade software, not a demo or proof of concept.

## ✨ Features

### 🔐 Security & Authentication
- JWT-based authentication with 15-minute expiry
- Role-based access control (RBAC) with 23 permissions
- Multi-tenant data isolation with RLS-ready architecture
- Password hashing with bcrypt (cost factor 12)
- Complete audit trails on all operations
- Soft delete preserving data integrity

### 📦 Procurement Management
- **Suppliers**: Complete vendor master data management
- **Purchase Orders**: Multi-line POs with automatic calculations
  - Auto-generated PO numbers (PO-YYYY-####)
  - Line-level pricing with discounts
  - Approval workflows
  - Status tracking (draft → approved → closed)

### 💼 Sales Management
- **Customers**: Customer master data with credit management
  - Credit limit tracking
  - Credit status (good/watch/hold)
  - Payment terms
- **Sales Orders**: Multi-line orders with calculations
  - Auto-generated SO numbers (SO-YYYY-####)
  - Customer PO tracking
  - Delivery date management
  - Status workflow (draft → confirmed → shipped → delivered)

### 📊 Inventory Management
- **Items**: Support for multiple item types
  - Raw materials, finished goods, work-in-progress, services
  - Lot/serial tracking configuration
  - Valuation methods (Average, FIFO, Standard Cost)
  - Planning parameters (lead time, safety stock, reorder point)
- **Warehouses**: Multi-location inventory management
  - Multiple warehouse types (regular, consignment, transit)
  - Location tracking
  - Stock count integration
- **Stock Transactions**: Real-time inventory tracking
  - Stock receipts (inbound)
  - Stock issues (outbound)
  - Stock transfers between warehouses
  - Stock adjustments
  - Auto-generated movement numbers (SM-YYYY-####)
  - Lot/serial number tracking
  - Real-time balance calculation

### 🏭 Manufacturing
- **Bill of Materials (BOM)**: Product structure definition
  - Parent-component relationships
  - Quantity per unit with scrap percentage
  - BOM versioning
  - Auto-generated BOM numbers (BOM-YYYY-####)
  - Material requirements calculation (MRP)
  - Multi-level BOM support
  - Circular reference prevention
- **Work Centers**: Production resource management
  - Machine and labor stations
  - Capacity tracking (units/hour)
  - Efficiency percentage
  - Cost per hour
- **Production Orders**: Manufacturing execution
  - BOM-based production planning
  - Auto-generated MO numbers (MO-YYYY-####)
  - Material requirements integration
  - Status workflow (draft → released → in_progress → completed)
  - Planned vs actual date tracking
  - Production quantity tracking

### 🏢 Multi-Tenancy
- Complete data isolation per tenant
- Tenant-specific numbering sequences
- Shared infrastructure with isolated data
- Automatic tenant scoping on all queries

### 📚 API Documentation
- Complete Swagger/OpenAPI documentation
- Interactive API testing at `/api/docs`
- Request/response examples
- Permission requirements documented

## 📊 Statistics

- **API Endpoints**: 65+
- **Business Modules**: 10
- **Database Tables**: 50
- **Lines of Code**: ~13,000+
- **Permissions**: 23
- **Test Coverage**: Manual testing complete

## 🛠️ Technology Stack

- **Backend Framework**: NestJS 10
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 15+
- **ORM**: Prisma 5
- **Authentication**: Passport.js + JWT
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI 3.0
- **Development**: Nodemon (auto-restart)

## 🚀 Getting Started

### Prerequisites

- Node.js 24+ (LTS recommended)
- PostgreSQL 15+
- npm or yarn

### Installation

1. **Clone the repository**
```bash
   git clone https://github.com/Automatajm/sunset-erp.git
   cd sunset-erp/backend
```

2. **Install dependencies**
```bash
   npm install
```

3. **Configure environment**
```bash
   cp .env.example .env
```
   
   Edit `.env` with your database credentials:
```env
   DATABASE_URL="postgresql://user:password@localhost:5432/sunset_erp_dev?schema=public"
   JWT_SECRET=your_jwt_secret_change_in_production
```

4. **Run database migrations**
```bash
   npx prisma migrate dev
```

5. **Seed the database**
```bash
   npm run seed
```

6. **Start development server**
```bash
   npm run start:dev
```

The API will be available at `http://localhost:3000/api`  
Swagger documentation at `http://localhost:3000/api/docs`

### Default Credentials

After seeding the database:
- **Email**: `admin@demo.com`
- **Password**: `Admin123!`
- **Tenant**: `DEMO`

## 📖 Documentation

- **[API Documentation](./API-DOCUMENTATION.md)** - Complete API reference
- **[Session Summary](./SESSION-SUMMARY.md)** - Development session details
- **[Swagger UI](http://localhost:3000/api/docs)** - Interactive API docs

## 🔑 API Overview

### Authentication
```bash
POST /api/auth/login
POST /api/auth/register
GET /api/auth/profile
```

### Procurement
```bash
# Suppliers
POST   /api/suppliers
GET    /api/suppliers
GET    /api/suppliers/:id
PATCH  /api/suppliers/:id
DELETE /api/suppliers/:id

# Purchase Orders
POST   /api/purchase-orders
GET    /api/purchase-orders
PATCH  /api/purchase-orders/:id/status/:status
```

### Sales
```bash
# Customers
POST   /api/customers
GET    /api/customers

# Sales Orders
POST   /api/sales-orders
GET    /api/sales-orders
PATCH  /api/sales-orders/:id/status/:status
```

### Inventory
```bash
# Items
POST   /api/items
GET    /api/items
GET    /api/items/statistics

# Warehouses
POST   /api/warehouses
GET    /api/warehouses

# Stock Transactions
POST   /api/stock-transactions
GET    /api/stock-transactions/balance
```

### Manufacturing
```bash
# BOM
POST   /api/bom
GET    /api/bom/:id/calculate/:quantity

# Work Centers
POST   /api/work-centers
GET    /api/work-centers

# Production Orders
POST   /api/production-orders
PATCH  /api/production-orders/:id/status/:status
```

## 🧪 Example Workflows

### Complete Manufacturing Workflow
```typescript
// 1. Create a finished good item
POST /api/items
{
  "code": "CHAIR-001",
  "name": "Office Chair",
  "itemType": "finished_good",
  "isManufacturable": true
}

// 2. Create BOM with components
POST /api/bom
{
  "itemId": "chair-uuid",
  "components": [
    { "componentItemId": "bolt-uuid", "quantity": 4, "scrapPercent": 5 },
    { "componentItemId": "steel-uuid", "quantity": 2, "scrapPercent": 10 }
  ]
}

// 3. Calculate material requirements
GET /api/bom/{bom-id}/calculate/200
// Returns: 840 bolts (800 + 40 scrap), 440kg steel (400 + 40 scrap)

// 4. Create production order
POST /api/production-orders
{
  "bomId": "bom-uuid",
  "quantityOrdered": 200
}
// Returns: MO-2026-0001

// 5. Release and start production
PATCH /api/production-orders/{id}/status/released
PATCH /api/production-orders/{id}/status/in_progress
```

## 🏗️ Architecture

### Clean Architecture
- **Controllers**: HTTP layer, request/response handling
- **Services**: Business logic and orchestration
- **DTOs**: Data validation and transformation
- **Guards**: Authorization and permission checks
- **Decorators**: Metadata and cross-cutting concerns

### Database Schema
- 50 tables covering all ERP modules
- Complete audit trail on all tables
- Soft delete implementation
- Foreign key constraints for data integrity
- Optimized indexes for performance

### Multi-Tenant Design
- Tenant ID on all business tables
- Automatic tenant scoping via middleware
- Isolated numbering sequences per tenant
- Shared infrastructure, separated data

## 🔒 Security Features

- **Authentication**: JWT tokens with short expiry
- **Authorization**: Permission-based access control
- **Password Security**: bcrypt with cost factor 12
- **Data Isolation**: Automatic tenant filtering
- **Audit Trail**: Complete change tracking
- **Input Validation**: class-validator on all DTOs
- **SQL Injection**: Protected by Prisma ORM
- **XSS Protection**: Input sanitization

## 📈 Performance

- **Database Indexing**: Optimized queries with proper indexes
- **Prisma ORM**: Efficient query generation
- **Eager Loading**: Reduces N+1 queries
- **Pagination Ready**: Can be added to list endpoints
- **Caching Ready**: Redis integration prepared

## 🧪 Testing

### Manual Testing
All modules have been manually tested with complete workflows:
- ✅ Authentication flows
- ✅ CRUD operations on all modules
- ✅ Business logic validation
- ✅ Permission enforcement
- ✅ Multi-tenant isolation
- ✅ Stock balance calculations
- ✅ BOM material requirements
- ✅ Production order workflows

### Test Data
Use the seed command to populate test data:
```bash
npm run seed        # Seed database
npm run seed:reset  # Reset and reseed
```

## 🚀 Deployment

### Docker (Recommended)
```bash
# Coming in Sprint 6
docker-compose up -d
```

### Manual Deployment
1. Set production environment variables
2. Run migrations: `npx prisma migrate deploy`
3. Build: `npm run build`
4. Start: `npm run start:prod`

### Environment Variables
```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=strong_secret_here
JWT_EXPIRES_IN=15m
PORT=3000
```

## 🗺️ Roadmap

- [x] **Sprint 1**: Foundation (Auth, Multi-tenant, RBAC)
- [x] **Sprint 2**: Business Modules (Procurement, Sales)
- [x] **Sprint 3**: Manufacturing (Inventory, BOM, Production)
- [ ] **Sprint 4**: Financial Management (GL, Reports)
- [ ] **Sprint 5**: Frontend (React + Vite)
- [ ] **Sprint 6**: DevOps (Docker, CI/CD, AWS)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author

**Juan Osvaldo Mendoza Santana**

- GitHub: [@Automatajm](https://github.com/Automatajm)
- Project: [Sunset ERP](https://github.com/Automatajm/sunset-erp)

## 🙏 Acknowledgments

- Built with passion for creating production-ready software
- Inspired by real-world ERP requirements
- Designed for scalability and maintainability

---

**Status**: Production Ready ✅  
**Version**: 1.0.0  
**Last Updated**: March 15, 2026

**⭐ If you find this project useful, please consider giving it a star!**
