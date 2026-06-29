import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { validateEnv } from './common/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { genReqId } from './common/logging/req-id';
import { AuthModule } from './auth/auth.module';
import { PoolsModule } from './pools/pools.module';
import { SessionsModule } from './sessions/sessions.module';
import { StatsModule } from './stats/stats.module';
import { PlacesModule } from './places/places.module';
import { MeModule } from './me/me.module';
import { ChallengesModule } from './challenges/challenges.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Structured JSON logging (pretty in dev) with per-request x-request-id correlation.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId,
        customProps: (req) => ({ requestId: (req as { id?: string }).id }),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: true,
        customLogLevel: (req, res, err) => {
          if (req.url?.startsWith('/health')) return 'debug';
          if (res.statusCode >= 500 || err) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    // Global baseline rate limit; auth routes tighten this further via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    PoolsModule,
    SessionsModule,
    StatsModule,
    PlacesModule,
    MeModule,
    ChallengesModule,
    HealthModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [PrismaService],
})
export class AppModule {}
