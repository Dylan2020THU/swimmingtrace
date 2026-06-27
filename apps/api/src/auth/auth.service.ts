import { Injectable, ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role === Role.OWNER ? Role.OWNER : Role.SWIMMER;

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name, role },
    });
    return this.sign(user.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.sign(user.id, user.email, user.role);
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
    return this.sign(user.id, user.email, user.role);
  }

  private sign(sub: string, email: string, role: Role) {
    // TODO (Phase 2): add refresh tokens + rotation.
    return { accessToken: this.jwt.sign({ sub, email, role }) };
  }
}
