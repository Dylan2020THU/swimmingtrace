import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService, LoginDto, RegisterDto } from './auth.service';
import { CurrentUser, JwtAuthGuard } from '../common/auth.common';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string; email: string; role: string }) {
    return user;
  }
}
