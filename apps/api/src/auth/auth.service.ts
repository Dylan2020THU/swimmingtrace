import { Injectable, ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { ClaimAccountDto, ClaimInfoResponse, LoginResponse } from '@swim/shared';

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() name?: string;
  // Only OWNER or SWIMMER may self-register; ADMIN is provisioned manually.
  @IsEnum(Role) @IsOptional() role?: Role;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class ClaimDto implements ClaimAccountDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role === Role.OWNER ? Role.OWNER : Role.SWIMMER;

    // A self-registered user owns their own credentials → mark claimed so their
    // account can never be treated as an owner-provisioned, claimable account.
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name, role, claimedAt: new Date() },
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(user);
  }

  private async findClaimable(token: string) {
    const user = await this.prisma.user.findUnique({ where: { claimToken: token } });
    if (!user) throw new NotFoundException('认领链接无效');
    if (user.claimedAt) throw new ConflictException('该账号已被认领');
    if (!user.claimTokenExpiresAt || user.claimTokenExpiresAt.getTime() < Date.now()) {
      throw new GoneException('认领链接已过期');
    }
    return user;
  }

  /** Validate a claim token and return who it belongs to (for the claim screen). */
  async getClaimInfo(token: string): Promise<ClaimInfoResponse> {
    const user = await this.findClaimable(token);
    return { name: user.name, email: user.email };
  }

  /** Claim an owner-created account: set the password, mark claimed, auto-login. */
  async claim(dto: ClaimAccountDto): Promise<LoginResponse> {
    const user = await this.findClaimable(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, claimedAt: new Date(), claimToken: null, claimTokenExpiresAt: null },
    });
    return this.issueSession(user);
  }

  private async issueSession(user: { id: string; email: string; role: Role }): Promise<LoginResponse> {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = await this.refreshTokens.issue(user.id);
    return { accessToken, refreshToken };
  }

  /** Rotate a refresh token → new access + new refresh (reuse ⇒ family revoked). */
  async refresh(presented: string): Promise<LoginResponse> {
    const { token, userId } = await this.refreshTokens.rotate(presented);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, refreshToken: token };
  }

  async logout(presented: string): Promise<void> {
    await this.refreshTokens.revoke(presented);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }
}
