// src/users/users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista perfiles publicos de usuarios' })
  async findPublicProfiles() {
    return this.usersService.findPublicProfiles();
  }

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

  @Post('me/avatar')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sube avatar a Cloudflare R2 y actualiza avatar_url del usuario' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: any,
  ) {
    return this.usersService.uploadAvatar(req.user.id, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de perfil publico de usuario' })
  async findPublicProfile(@Param('id') id: string) {
    return this.usersService.findPublicProfileById(id);
  }
}
