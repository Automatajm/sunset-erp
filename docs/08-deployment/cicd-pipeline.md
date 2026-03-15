# CI/CD PIPELINE

## GitHub Actions Workflow
1. Push code → Run tests
2. Build Docker image
3. Push to ECR
4. Deploy to environment
5. Run smoke tests

## Deployment Flow
- develop branch → Auto-deploy to Dev
- main branch → Auto-deploy to Staging
- Release tag → Manual approval → Production

## Blue/Green Deployment
- Zero downtime
- Automatic rollback on failure
