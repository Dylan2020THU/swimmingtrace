import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiKeyListItem, CreatedApiKey } from '@swim/shared';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { generateApiKey } from './api-key.util';

@Injectable()
export class ApiKeysService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
  ) {}

  /** Creates a key (Pro feature). The plaintext is returned ONCE; only the hash is stored. */
  async create(ownerId: string, label: string): Promise<CreatedApiKey> {
    await this.billing.assertFeature(ownerId, 'apiKeys');
    const { plaintext, prefix, keyHash } = generateApiKey();
    const row = await this.prisma.apiKey.create({ data: { ownerId, label, prefix, keyHash } });
    return { id: row.id, label: row.label, prefix: row.prefix, key: plaintext, createdAt: row.createdAt.toISOString() };
  }

  async list(ownerId: string): Promise<ApiKeyListItem[]> {
    const rows = await this.prisma.apiKey.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      prefix: r.prefix,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async revoke(ownerId: string, id: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.apiKey.deleteMany({ where: { id, ownerId } });
    if (count === 0) throw new NotFoundException('API key not found');
    return { ok: true };
  }
}
