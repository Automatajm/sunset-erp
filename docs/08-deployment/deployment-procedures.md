# DEPLOYMENT PROCEDURES

## Standard Deployment
1. Create release branch
2. Update version (npm version)
3. Push to GitHub
4. Create PR to main (staging)
5. Create Release (production)
6. Monitor for 15 minutes

## Rollback
1. Identify previous version
2. Update ECS service
3. Monitor health checks
4. Verify functionality

## Database Migrations
1. Test in staging
2. Backup production
3. Deploy with migration
4. Verify health
