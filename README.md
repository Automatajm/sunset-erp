# SUNSET ERP

**Multi-Tenant SaaS ERP Platform**

Enterprise-grade ERP system for the Dominican Republic market with global scalability.

## Features

- Multi-tenant SaaS architecture (shared database with row-level security)
- M:N relationships (users can belong to multiple companies)
- Multi-currency support with exchange rates
- Multi-language (i18n) - Spanish, English, extensible
- Subscription billing (Free, Basic, Pro, Enterprise)
- NetSuite-inspired UI/UX
- RESTful API with OpenAPI 3.0

## Technology Stack

**Backend:** NestJS, TypeScript, Prisma, PostgreSQL, Redis  
**Frontend:** React, Vite, Tailwind CSS, react-i18next  
**DevOps:** Jenkins, Docker, Git

## Project Structure
```
Sunset-ERP/
├── docs/              # Complete documentation
├── backend/           # NestJS API
├── frontend/          # React SPA
├── infrastructure/    # Docker, Terraform
├── MASTER-PLAN.md     # Development plan
└── README.md          # This file
```

## Getting Started

See [MASTER-PLAN.md](./MASTER-PLAN.md) for complete development plan.

**Current Phase:** Phase 1 - Discovery & Requirements

## Timeline

Total: 28 weeks (7 months)

## Success Criteria

- 80%+ test coverage
- API < 200ms (95th percentile)
- 99.9% uptime SLA
- Multi-tenant isolation validated
- i18n support (2+ languages)
- Multi-currency support

## License

Proprietary - All rights reserved

## Author

Juan Mendoza  
La Romana, Dominican Republic  
March 2026
