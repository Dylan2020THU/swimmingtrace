import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Prisma } from '@prisma/client';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { requestHash } from './request-hash';

function makeCtx(opts: {
  method?: string;
  key?: string;
  userId?: string;
  body?: unknown;
}) {
  const req: any = {
    method: opts.method ?? 'POST',
    headers: opts.key ? { 'idempotency-key': opts.key } : {},
    user: opts.userId ? { id: opts.userId } : undefined,
    body: opts.body ?? { distanceMeters: 100 },
    originalUrl: '/sessions',
    url: '/sessions',
  };
  const res: any = { statusCode: 201, status: jest.fn() };
  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => function handler() {},
  };
  return { ctx, req, res };
}

const handler = (val: unknown) => ({ handle: () => of(val) });

function makePrisma() {
  return {
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function makeInterceptor(prisma: any) {
  const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
  return new IdempotencyInterceptor(prisma, reflector);
}

describe('IdempotencyInterceptor', () => {
  it('非 POST 透传，不查库', async () => {
    const prisma = makePrisma();
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ method: 'GET', key: 'k1', userId: 'u1' });
    const out = await i.intercept(ctx, handler('passthrough'));
    expect(await firstValueFrom(out)).toBe('passthrough');
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('无 Idempotency-Key 头透传', async () => {
    const prisma = makePrisma();
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ userId: 'u1' });
    await firstValueFrom(await i.intercept(ctx, handler('x')));
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('未认证（无 user）透传', async () => {
    const prisma = makePrisma();
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1' });
    await firstValueFrom(await i.intercept(ctx, handler('x')));
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('已完成 + 同载荷 → 重放存储响应，不执行 handler', async () => {
    const prisma = makePrisma();
    const body = { distanceMeters: 100 };
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      completedAt: new Date(),
      requestHash: requestHash('POST', '/sessions', body),
      responseStatus: 201,
      responseBody: { id: 'sess-1' },
    });
    const i = makeInterceptor(prisma);
    const { ctx, res } = makeCtx({ key: 'k1', userId: 'u1', body });
    const next = handler({ id: 'SHOULD-NOT-RUN' });
    const handleSpy = jest.spyOn(next, 'handle');
    const out = await i.intercept(ctx, next);
    expect(await firstValueFrom(out)).toEqual({ id: 'sess-1' });
    expect(handleSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('已完成 + 异载荷 → 422', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      completedAt: new Date(),
      requestHash: requestHash('POST', '/sessions', { distanceMeters: 999 }),
      responseStatus: 201,
      responseBody: {},
    });
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1', userId: 'u1', body: { distanceMeters: 100 } });
    await expect(i.intercept(ctx, handler('x'))).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('进行中（completedAt 为空）→ 409', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.findUnique.mockResolvedValue({ completedAt: null, requestHash: 'h' });
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1', userId: 'u1' });
    await expect(i.intercept(ctx, handler('x'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('首次 → 抢占 key、执行 handler、完成时落库', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.create.mockResolvedValue({});
    prisma.idempotencyKey.update.mockResolvedValue({});
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1', userId: 'u1' });
    const out = await i.intercept(ctx, handler({ id: 'new-sess' }));
    expect(await firstValueFrom(out)).toEqual({ id: 'new-sess' });
    expect(prisma.idempotencyKey.create).toHaveBeenCalled();
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responseStatus: 201, completedAt: expect.any(Date) }),
      }),
    );
  });

  it('并发抢占（create P2002）→ 409', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1', userId: 'u1' });
    await expect(i.intercept(ctx, handler('x'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('handler 抛错 → 释放 key 后 rethrow', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.create.mockResolvedValue({});
    prisma.idempotencyKey.delete.mockResolvedValue({});
    const i = makeInterceptor(prisma);
    const { ctx } = makeCtx({ key: 'k1', userId: 'u1' });
    const boom = { handle: () => throwError(() => new Error('boom')) } as any;
    await expect(firstValueFrom(await i.intercept(ctx, boom))).rejects.toThrow('boom');
    expect(prisma.idempotencyKey.delete).toHaveBeenCalled();
  });
});
