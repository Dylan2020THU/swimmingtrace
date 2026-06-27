import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export async function assertOwnsPool(prisma: PrismaService, ownerId: string, poolId: string) {
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new NotFoundException('Pool not found');
  if (pool.ownerId !== ownerId) throw new ForbiddenException();
  return pool;
}

export async function assertOwnsSwimmer(prisma: PrismaService, ownerId: string, swimmerId: string): Promise<void> {
  const reg = await prisma.registration.findFirst({
    where: { swimmerId, pool: { ownerId } },
  });
  if (!reg) throw new ForbiddenException();
}

export async function assertOwnsChallenge(prisma: PrismaService, ownerId: string, challengeId: string) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, include: { pool: true } });
  if (!challenge) throw new NotFoundException('Challenge not found');
  if (challenge.pool.ownerId !== ownerId) throw new ForbiddenException();
  return challenge;
}
