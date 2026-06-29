import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiKeysService } from './api-keys.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

export class CreateApiKeyBody {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
}

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  /** Create a key (Pro). Returns the plaintext ONCE. */
  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateApiKeyBody) {
    return this.apiKeys.create(user.id, dto.label);
  }

  @Get()
  @Roles(Role.OWNER)
  list(@CurrentUser() user: { id: string }) {
    return this.apiKeys.list(user.id);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @HttpCode(200)
  revoke(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.apiKeys.revoke(user.id, id);
  }
}
