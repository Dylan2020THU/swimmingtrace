import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';

// ---- Decorators ----

export const ROLES_KEY = 'roles';
/** Restrict a route to one or more roles: @Roles(Role.OWNER) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the authenticated user: handler(@CurrentUser() user) */
export const CurrentUser = createParamDecorator(
  (_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

// ---- Guards ----

/** Validates the Bearer JWT via the 'jwt' passport strategy. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

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
