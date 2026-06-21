import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CreateSessionDto, SessionsService } from './sessions.service';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../common/auth.common';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Post()
  @Roles(Role.SWIMMER)
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateSessionDto) {
    return this.sessions.create(user.id, dto);
  }

  @Get('me')
  @Roles(Role.SWIMMER)
  mine(@CurrentUser() user: { id: string }) {
    return this.sessions.listForSwimmer(user.id);
  }
}
