import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, ClaimDto, LoginDto, RegisterDto } from './auth.service';
import { CurrentUser, JwtAuthGuard } from '../common/auth.common';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // Tighter limit on credential endpoints to blunt brute-force / stuffing.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('claim/:token')
  claimInfo(@Param('token') token: string) {
    return this.auth.getClaimInfo(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('claim')
  claim(@Body() dto: ClaimDto) {
    return this.auth.claim(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string; email: string; role: string }) {
    return user;
  }
}
