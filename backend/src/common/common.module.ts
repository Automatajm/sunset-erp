import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';

// Global cross-cutting providers. CacheService is available app-wide without an
// explicit import, mirroring PrismaModule / RedisModule.
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CommonModule {}
