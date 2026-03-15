# INFRASTRUCTURE ARCHITECTURE

## AWS Services
- Compute: ECS with Fargate
- Database: RDS PostgreSQL (Multi-AZ)
- Cache: ElastiCache Redis
- Storage: S3
- CDN: Cloudflare

## Environments
- Dev: 1 instance, db.t3.micro
- Staging: 2 instances, db.t3.small
- Production: 3+ instances, db.r6g.large

## Cost: ~$760/month (1K tenants)
