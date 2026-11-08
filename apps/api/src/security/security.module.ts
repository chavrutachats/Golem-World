import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppErrorFilter } from './http-hardening.js';
import { MaintenanceService } from './maintenance.service.js';
import { MemoryRateLimitStore } from './rate-limit.js';
import { IpRateLimitGuard, UserRateLimitInterceptor } from './rate-limit.guards.js';
import { RATE_LIMIT_STORE, RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  providers: [
    { provide: RATE_LIMIT_STORE, useFactory: () => new MemoryRateLimitStore() },
    RateLimitService,
    MaintenanceService,
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: UserRateLimitInterceptor },
    { provide: APP_FILTER, useClass: AppErrorFilter },
  ],
  exports: [RateLimitService, MaintenanceService],
})
export class SecurityModule {}
