import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { API_KEY_PREFIX, hashApiKey } from '../api-keys/api-key.util';

// ---- Decorators ----

export const ROLES_KEY = 'roles';
/** Restrict a route to one or more roles: @Roles(Role.OWNER) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the authenticated user: handler(@CurrentUser() user) */
export const CurrentUser = createParamDecorator(
  (_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

// ---- Guards ----

/**
 * Validates the Bearer credential. A token with the `swk_` prefix is an API key:
 * it's looked up by hash and (if valid) acts as its OWNER. Anything else falls
 * through to the 'jwt' passport strategy.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token && token.startsWith(API_KEY_PREFIX)) {
      const key = await this.prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(token) },
        include: { owner: { select: { id: true, email: true, role: true, emailVerifiedAt: true } } },
      });
      if (!key) throw new UnauthorizedException();
      req.user = {
        id: key.owner.id,
        email: key.owner.email,
        role: key.owner.role,
        emailVerifiedAt: key.owner.emailVerifiedAt,
      };
      // Usage stamp; a failed update (e.g. key just revoked) must not break auth.
      await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}

/** Checks req.user.role against @Roles metadata. Use AFTER JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    return !!user && required.includes(user.role);
  }
}
