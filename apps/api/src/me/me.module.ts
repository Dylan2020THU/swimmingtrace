import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({ imports: [ChallengesModule], controllers: [MeController], providers: [MeService, PrismaService] })
export class MeModule {}
