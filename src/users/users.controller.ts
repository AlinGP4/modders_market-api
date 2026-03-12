// src/users/users.controller.ts
import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('devs')
  @ApiOperation({ summary: 'Lista especialistas disponibles' })
  async findDevs() {
    return this.usersService.findDevs();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async getProfile(@Request() req: any) {
    return this.usersService.findProfile(req.user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async updateProfile(@Body() dto: CreateUserProfileDto, @Request() req: any) {
    return this.usersService.updateProfile(req.user.id, dto);
  }
}
