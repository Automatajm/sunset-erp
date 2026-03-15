# 🚀 Sunset ERP

A modern, production-ready, multi-tenant SaaS ERP platform built with NestJS and PostgreSQL.

## 📋 Overview

Sunset ERP is a complete enterprise resource planning system designed for multi-tenant SaaS deployment. It provides comprehensive business management capabilities including procurement, inventory, sales, and more.

## ✨ Features

### 🔐 Security & Authentication
- JWT-based authentication
- Role-based access control (RBAC)
- Multi-tenant data isolation
- Password hashing with bcrypt
- Complete audit trails

### 📦 Business Modules

#### Procurement
- **Suppliers**: Complete supplier master data management
- **Purchase Orders**: Multi-line POs with automatic calculations
- Approval workflows
- Status tracking

#### Inventory
- **Items**: Support for multiple item types
- Lot/serial tracking
- Valuation methods (Average, FIFO, Standard)
- Planning parameters

#### Sales
- **Customers**: Customer master data with credit management
- **Sales Orders**: Multi-line orders with calculations
- Customer PO tracking
- Delivery date management

### 🏢 Multi-Tenancy
- Complete data isolation per tenant
- Tenant-specific numbering sequences
- Shared infrastructure, isolated data

### 📚 API Documentation
- Complete Swagger/OpenAPI documentation
- Interactive API testing
- Request/response examples

## 🛠️ Technology Stack

- **Backend**: NestJS 10
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 15+
- **ORM**: Prisma 5
- **Authentication**: Passport.js + JWT
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI
- **Development**: Nodemon

## 📊 Stats

- **API Endpoints**: 40
- **Business Modules**: 5
- **Database Tables**: 50
- **Lines of Code**: ~8,000+
- **Permissions**: 23

## 🚀 Getting Started

### Prerequisites
- Node.js 24+
- PostgreSQL 15+
- npm or yarn

### Installation

1. Clone the repository
\`\`\`bash
git clone https://github.com/Automatajm/sunset-erp.git
cd sunset-erp/backend
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Configure environment
\`\`\`bash
cp .env.example .env
# Edit .env with your database credentials
\`\`\`

4. Run migrations
\`\`\`bash
npx prisma migrate dev
\`\`\`

5. Seed database
\`\`\`bash
npm run seed
\`\`\`

6. Start development server
\`\`\`bash
npm run start:dev
\`\`\`

The API will be available at `http://localhost:3000/api`  
Swagger docs at `http://localhost:3000/api/docs`

### Default Credentials

After seeding:
- **Email**: admin@demo.com
- **Password**: Admin123!
- **Tenant**: DEMO

## 📖 API Documentation

Visit `http://localhost:3000/api/docs` for complete API documentation.

### Key Endpoints

**Authentication**
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login and get JWT
- GET `/api/auth/profile` - Get user profile

**Suppliers**
- GET `/api/suppliers` - List all suppliers
- POST `/api/suppliers` - Create supplier
- PATCH `/api/suppliers/:id` - Update supplier

**Items**
- GET `/api/items` - List all items
- GET `/api/items/statistics` - Get statistics
- POST `/api/items` - Create item

**Purchase Orders**
- GET `/api/purchase-orders` - List POs
- POST `/api/purchase-orders` - Create PO
- PATCH `/api/purchase-orders/:id/status/:status` - Update status

**Customers**
- GET `/api/customers` - List customers
- POST `/api/customers` - Create customer

**Sales Orders**
- GET `/api/sales-orders` - List SOs
- POST `/api/sales-orders` - Create SO
- PATCH `/api/sales-orders/:id/status/:status` - Update status

## 🏗️ Architecture

### Clean Architecture
- **Controllers**: HTTP layer, request/response handling
- **Services**: Business logic
- **DTOs**: Data validation
- **Guards**: Authorization
- **Decorators**: Metadata

### Database Schema
50 tables covering:
- SaaS core (tenants, subscriptions)
- Authentication (users, roles, permissions)
- Procurement (suppliers, purchase orders)
- Inventory (items, stock, movements)
- Sales (customers, sales orders)
- Manufacturing (BOMs, work centers, production orders)
- Accounting (accounts, journal entries)

## 🔒 Security

- JWT tokens with 15-minute expiry
- bcrypt password hashing (cost 12)
- Permission-based access control
- Tenant data isolation (RLS ready)
- SQL injection prevention (Prisma ORM)
- Input validation on all endpoints
- Complete audit trails

## 📈 Roadmap

- [x] Sprint 1: Foundation (Auth, Multi-tenant, RBAC)
- [x] Sprint 2: Business Modules (Procurement, Sales)
- [ ] Sprint 3: Manufacturing & Production
- [ ] Sprint 4: Financial Management
- [ ] Sprint 5: Frontend (React + Vite)
- [ ] Sprint 6: DevOps & Deployment

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Juan Osvaldo Mendoza Santana**

## 🙏 Acknowledgments

Built with passion for creating production-ready software.

---

**Status**: Production Ready ✅  
**Version**: 1.0.0  
**Last Updated**: March 15, 2026
