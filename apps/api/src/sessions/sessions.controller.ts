import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginationQuery } from '../common/pagination';
import { Role } from '@prisma/client';
import { CreateSessionDto, SessionsService } from './sessions.service';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../common/auth.common';

@ApiTags('sessions')
@ApiBearerAuth()
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
  mine(@CurrentUser() user: { id: string }, @Query() q: PaginationQuery) {
    return this.sessions.listForSwimmer(user.id, q.page, q.pageSize);
  }
}
