import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { PoolsModule } from './pools/pools.module';
import { SessionsModule } from './sessions/sessions.module';
import { StatsModule } from './stats/stats.module';
import { PlacesModule } from './places/places.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PoolsModule,
    SessionsModule,
    StatsModule,
    PlacesModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
