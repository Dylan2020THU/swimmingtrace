import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MyPoolItem } from '@swim/shared';

@Injectable()
export class MeService {
  constructor(private prisma: PrismaService) {}

  /** Pools the swimmer is actively registered in (for selecting where to self-record). */
  async myPools(swimmerId: string): Promise<MyPoolItem[]> {
    const regs = await this.prisma.registration.findMany({
      where: { swimmerId, status: 'ACTIVE' },
      include: { pool: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    return regs.map((r) => ({ id: r.pool.id, name: r.pool.name }));
  }
}
