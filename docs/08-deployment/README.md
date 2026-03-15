# DEPLOYMENT DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 08-deployment  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

Infrastructure, deployment procedures, CI/CD pipelines, and DevOps practices for Sunset ERP.

---

## DOCUMENTS IN THIS SECTION

### 1. [Infrastructure Architecture](./infrastructure-architecture.md)
Cloud infrastructure, load balancers, databases, caching.

### 2. [Docker Configuration](./docker-configuration.md)
Dockerfile, docker-compose, container orchestration.

### 3. [CI/CD Pipeline](./cicd-pipeline.md)
Automated testing, building, and deployment.

### 4. [Environment Management](./environment-management.md)
Dev, staging, production configurations.

### 5. [Deployment Procedures](./deployment-procedures.md)
Step-by-step deployment guide, rollback procedures.

---

## INFRASTRUCTURE OVERVIEW

### Cloud Provider
- **Primary:** AWS (Amazon Web Services)
- **Regions:** 
  - Primary: us-east-1 (N. Virginia)
  - DR: us-west-2 (Oregon)
- **CDN:** Cloudflare

### Architecture Diagram
```
Internet
    ↓
Cloudflare CDN (DDoS protection, SSL)
    ↓
AWS Route 53 (DNS)
    ↓
Application Load Balancer (ALB)
    ↓
┌─────────────────────────────────────┐
│  ECS Cluster (Fargate)              │
│  ┌──────────┐  ┌──────────┐        │
│  │ API (x3) │  │ API (x3) │        │
│  └──────────┘  └──────────┘        │
└─────────────────────────────────────┘
    ↓                    ↓
RDS PostgreSQL      ElastiCache Redis
(Primary + Replica) (Cluster mode)
    ↓
S3 (File Storage)
```

---

## TECHNOLOGY STACK

### Compute
- **Container Orchestration:** AWS ECS with Fargate
- **Auto-scaling:** CPU-based (target: 70%)
- **Instances:** 
  - Dev: 1 instance (512 MB RAM, 0.25 vCPU)
  - Staging: 2 instances (1 GB RAM, 0.5 vCPU)
  - Production: 3+ instances (2 GB RAM, 1 vCPU)

### Database
- **Service:** Amazon RDS PostgreSQL 15
- **Instance Type:** 
  - Dev: db.t3.micro
  - Staging: db.t3.small
  - Production: db.r6g.large (Multi-AZ)
- **Backups:** Automated daily, 30-day retention
- **Replicas:** 2 read replicas for production

### Caching
- **Service:** Amazon ElastiCache Redis 7
- **Instance Type:**
  - Dev: cache.t3.micro
  - Production: cache.r6g.large (Cluster mode)

### Storage
- **Service:** Amazon S3
- **Buckets:**
  - sunset-erp-uploads-prod
  - sunset-erp-backups-prod
  - sunset-erp-logs-prod
- **Lifecycle:** Move to Glacier after 90 days

### Networking
- **VPC:** Isolated per environment
- **Subnets:** Public (ALB), Private (ECS, RDS)
- **Security Groups:** Strict ingress/egress rules
- **NAT Gateway:** For outbound internet access

---

## DOCKER CONFIGURATION

### Dockerfile (Backend)
```dockerfile
# Multi-stage build for smaller image
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Run as non-root user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node healthcheck.js

# Start application
CMD ["node", "dist/main.js"]
```

### Dockerfile (Frontend)
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage (nginx)
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### docker-compose.yml (Local Development)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: sunset_erp_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/sunset_erp_dev
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - api

volumes:
  postgres_data:
```

---

## CI/CD PIPELINE

### Tools
- **CI/CD Platform:** GitHub Actions
- **Container Registry:** Amazon ECR
- **Infrastructure as Code:** Terraform (future)

### Pipeline Stages

**1. Code Push to GitHub**
```
Developer pushes to branch
  ↓
GitHub Actions triggered
```

**2. Build & Test**
```
- Checkout code
- Install dependencies
- Run linter (ESLint)
- Run unit tests (Jest/Vitest)
- Run integration tests
- Build Docker image
- Security scan (Snyk)
```

**3. Deploy to Dev (Auto)**
```
On push to develop branch:
  ↓
- Build Docker image
- Push to ECR
- Update ECS task definition
- Deploy to dev environment
- Run smoke tests
```

**4. Deploy to Staging (Auto)**
```
On push to main branch:
  ↓
- Build Docker image
- Push to ECR
- Deploy to staging
- Run E2E tests (Playwright)
- Notify team in Slack
```

**5. Deploy to Production (Manual Approval)**
```
Manual approval required
  ↓
- Create GitHub Release
- Tag Docker image with version
- Deploy to production (blue/green)
- Run smoke tests
- Monitor for 15 minutes
- If healthy: Complete deployment
- If issues: Automatic rollback
```

### GitHub Actions Workflow
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run linter
        run: npm run lint
        
      - name: Run tests
        run: npm run test:ci
        
      - name: Build
        run: npm run build

  deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Dev
        run: |
          # Build and push Docker image
          # Update ECS service

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Staging
        run: |
          # Build and push Docker image
          # Update ECS service

  deploy-production:
    needs: deploy-staging
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Production
        run: |
          # Blue/green deployment
          # Health checks
          # Rollback if needed
```

---

## ENVIRONMENT CONFIGURATION

### Development
```bash
# .env.development
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sunset_erp_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_change_in_production
PORT=3000
LOG_LEVEL=debug
```

### Staging
```bash
# .env.staging (AWS Secrets Manager)
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@rds-staging.amazonaws.com:5432/sunset_erp_staging
REDIS_URL=redis://elasticache-staging.amazonaws.com:6379
JWT_SECRET=${AWS_SECRET:JWT_SECRET_STAGING}
PORT=3000
LOG_LEVEL=info
STRIPE_KEY=${AWS_SECRET:STRIPE_TEST_KEY}
```

### Production
```bash
# .env.production (AWS Secrets Manager)
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@rds-prod.amazonaws.com:5432/sunset_erp_prod
REDIS_URL=redis://elasticache-prod.amazonaws.com:6379
JWT_SECRET=${AWS_SECRET:JWT_SECRET_PROD}
PORT=3000
LOG_LEVEL=warn
STRIPE_KEY=${AWS_SECRET:STRIPE_LIVE_KEY}
SENTRY_DSN=${AWS_SECRET:SENTRY_DSN}
```

---

## DEPLOYMENT PROCEDURES

### Standard Deployment (Staging/Production)
```bash
# 1. Create release branch
git checkout -b release/v1.2.0

# 2. Update version
npm version minor  # or patch, major

# 3. Run tests locally
npm run test
npm run test:e2e

# 4. Push to GitHub
git push origin release/v1.2.0

# 5. Create Pull Request to main
# (Triggers staging deployment)

# 6. After staging validation, create GitHub Release
# (Triggers production deployment with manual approval)

# 7. Monitor deployment
# - Check ECS task health
# - Monitor error rates
# - Review CloudWatch logs

# 8. If issues, rollback:
aws ecs update-service \
  --cluster sunset-erp-prod \
  --service api \
  --task-definition sunset-erp-api:previous
```

### Hotfix Deployment
```bash
# 1. Create hotfix branch from main
git checkout -b hotfix/critical-bug

# 2. Fix issue + add tests

# 3. Fast-track through pipeline
# Skip staging, direct to production with approval

# 4. Deploy with extra monitoring

# 5. Post-mortem after deployment
```

### Database Migration Deployment
```bash
# 1. Test migration in staging
npx prisma migrate deploy

# 2. Schedule maintenance window (if breaking change)

# 3. Backup production database
./scripts/backup-production.sh

# 4. Deploy new code (with migration)

# 5. Run migration
npx prisma migrate deploy

# 6. Verify application health

# 7. If issues, rollback:
#    - Restore database from backup
#    - Deploy previous code version
```

---

## ROLLBACK PROCEDURES

### Application Rollback
```bash
# 1. Identify previous stable version
aws ecs describe-task-definition \
  --task-definition sunset-erp-api \
  --query 'taskDefinition.revision'

# 2. Update service to previous version
aws ecs update-service \
  --cluster sunset-erp-prod \
  --service api \
  --task-definition sunset-erp-api:42  # previous revision

# 3. Monitor rollback
watch -n 5 'aws ecs describe-services \
  --cluster sunset-erp-prod \
  --services api \
  --query "services[0].deployments"'

# 4. Verify health
curl https://api.sunset-erp.com/health
```

### Database Rollback
```bash
# 1. Stop application traffic
aws ecs update-service \
  --cluster sunset-erp-prod \
  --service api \
  --desired-count 0

# 2. Restore from backup
pg_restore -d sunset_erp_prod backup_YYYYMMDD_HHMMSS.dump

# 3. Verify data
psql -d sunset_erp_prod -c "SELECT COUNT(*) FROM saas_tenants;"

# 4. Restart application
aws ecs update-service \
  --cluster sunset-erp-prod \
  --service api \
  --desired-count 3
```

---

## MONITORING DEPLOYMENT

### Health Checks
```bash
# Application health
curl https://api.sunset-erp.com/health

# Database connectivity
curl https://api.sunset-erp.com/health/db

# Redis connectivity
curl https://api.sunset-erp.com/health/redis
```

### CloudWatch Dashboards
- Request count (by endpoint)
- Error rate (4xx, 5xx)
- Response time (p50, p95, p99)
- CPU/Memory usage (ECS tasks)
- Database connections
- Cache hit rate

### Post-Deployment Checklist
- [ ] All ECS tasks running (3/3)
- [ ] Health checks passing
- [ ] Error rate < 1%
- [ ] Response time p95 < 500ms
- [ ] Database connections normal
- [ ] No alerts triggered
- [ ] Smoke tests passed
- [ ] Team notified in Slack

---

## SCALING CONFIGURATION

### Auto-Scaling (ECS)
```json
{
  "targetTrackingScaling": {
    "targetValue": 70.0,
    "metric": "ECSServiceAverageCPUUtilization",
    "scaleInCooldown": 300,
    "scaleOutCooldown": 60
  },
  "minCapacity": 3,
  "maxCapacity": 20
}
```

### Database Scaling
- **Vertical:** Resize RDS instance (requires downtime)
- **Horizontal:** Add read replicas (no downtime)
- **Future:** Sharding at 10,000+ tenants

---

## DISASTER RECOVERY

### Backup Strategy
- **Database:** Automated daily backups (RDS)
- **Files:** S3 with versioning enabled
- **Configuration:** Infrastructure as Code (Git)

### Recovery Procedure
```
1. Declare disaster
2. Provision new infrastructure (Terraform)
3. Restore database from backup
4. Deploy latest application version
5. Update DNS to new environment
6. Verify functionality
7. Monitor closely
```

**RTO (Recovery Time Objective):** 1 hour  
**RPO (Recovery Point Objective):** 15 minutes

---

## COST OPTIMIZATION

### Monthly Cost Estimate (1,000 tenants)

| Service | Instance | Cost/Month |
|---------|----------|------------|
| ECS (3 tasks) | 2 GB RAM, 1 vCPU | $50 |
| RDS PostgreSQL | db.r6g.large Multi-AZ | $350 |
| ElastiCache Redis | cache.r6g.large | $200 |
| ALB | Standard | $25 |
| S3 | 100 GB + requests | $5 |
| CloudWatch | Logs + metrics | $30 |
| Data Transfer | Estimated | $100 |
| **Total** | | **~$760/month** |

**Cost per tenant:** $0.76/month (infrastructure only)

---

## SECURITY HARDENING

### Container Security
- Run as non-root user
- Minimal base image (Alpine)
- No secrets in image
- Image scanning (Snyk/Trivy)

### Network Security
- Private subnets for databases
- Security groups (whitelist only)
- WAF rules (Cloudflare)
- VPC Flow Logs enabled

### Secrets Management
- AWS Secrets Manager for credentials
- Rotate secrets quarterly
- No secrets in code/environment files

---

**Status:** Complete deployment architecture  
**Priority:** CRITICAL - Production readiness  
**Owner:** DevOps Team