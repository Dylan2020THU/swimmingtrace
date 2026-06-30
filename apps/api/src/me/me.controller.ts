import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';
import { Gender, UpdateProfileDto } from '@swim/shared';
import { MeService } from './me.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

export class UpdateProfileBody implements UpdateProfileDto {
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: Gender;
  @IsOptional() @IsDateString() birthDate?: string;
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private me: MeService) {}

  @Get('pools')
  @Roles(Role.SWIMMER)
  pools(@CurrentUser() user: { id: string }) {
    return this.me.myPools(user.id);
  }

  @Get('challenges')
  @Roles(Role.SWIMMER)
  challenges(@CurrentUser() user: { id: string }) {
    return this.me.myChallenges(user.id);
  }

  @Patch('profile')
  @Roles(Role.SWIMMER)
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileBody) {
    return this.me.updateProfile(user.id, dto);
  }
}
