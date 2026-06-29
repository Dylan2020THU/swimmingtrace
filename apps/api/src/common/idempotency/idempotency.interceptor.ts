import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { requestHash } from './request-hash';

const HEADER = 'idempotency-key';
// Nest stores an @HttpCode override under this metadata key; fall back to the
// method default (POST → 201) so a replay restores the original status code.
const HTTP_CODE_METADATA = '__httpCode__';

type AuthedRequest = Request & { user?: { id: string } };

/**
 * Replays authenticated create-POSTs that carry an `Idempotency-Key` header.
 * First request runs the handler and persists (status, body); a replay with the
 * same key returns the stored response without re-executing. Same key + different
 * payload → 422; a concurrent in-flight request with the same key → 409.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers?.[HEADER] as string | undefined;
    const userId = req.user?.id;

    if (req.method !== 'POST' || !key || !userId) {
      return next.handle();
    }

    const path = req.originalUrl ?? req.url;
    const hash = requestHash(req.method, path, req.body);
    const where = { userId_key: { userId, key } };

    const existing = await this.prisma.idempotencyKey.findUnique({ where });
    if (existing) {
      if (existing.completedAt) {
        if (existing.requestHash !== hash) {
          throw new UnprocessableEntityException(
            'Idempotency-Key already used with a different request payload',
          );
        }
        res.status(existing.responseStatus ?? 200);
        return of(existing.responseBody);
      }
      throw new ConflictException('A request with this Idempotency-Key is already in progress');
    }

    // Claim the key. The unique (userId, key) constraint turns a concurrent
    // first-request into a P2002, which we surface as 409.
    try {
      await this.prisma.idempotencyKey.create({
        data: { userId, key, method: req.method, path, requestHash: hash },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A request with this Idempotency-Key is already in progress');
      }
      throw e;
    }

    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ?? 201;

    return next.handle().pipe(
      mergeMap(async (body) => {
        await this.prisma.idempotencyKey.update({
          where,
          data: {
            responseStatus: status,
            responseBody:
              body === undefined || body === null
                ? Prisma.JsonNull
                : (body as Prisma.InputJsonValue),
            completedAt: new Date(),
          },
        });
        return body;
      }),
      catchError((err) =>
        // The handler failed — release the key so the client can retry.
        from(this.prisma.idempotencyKey.delete({ where }).catch(() => undefined)).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}
