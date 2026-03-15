# DATA ENCRYPTION

## At Rest
- Database: AES-256
- Backups: Encrypted
- S3: Server-side encryption

## In Transit
- TLS 1.3 only
- HSTS enabled
- Certificate auto-renewal

## Key Management
- AWS Secrets Manager
- Rotate keys annually
- Separate keys per environment
