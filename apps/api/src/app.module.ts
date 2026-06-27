import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { validateEnv } from './common/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthModule } from './auth/auth.module';
import { PoolsModule } from './pools/pools.module';
import { SessionsModule } from './sessions/sessions.module';
import { StatsModule } from './stats/stats.module';
import { PlacesModule } from './places/places.module';
import { MeModule } from './me/me.module';
import { ChallengesModule } from './challenges/challenges.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global baseline rate limit; auth routes tighten this further via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    PoolsModule,
    SessionsModule,
    StatsModule,
    PlacesModule,
    MeModule,
    ChallengesModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [PrismaService],
})
export class AppModule {}
