import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ChatsService } from './chats.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { StartDirectConversationDto } from './dto/start-direct-conversation.dto';

@ApiTags('chats')
@Controller('chats')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user direct conversations' })
  async listConversations(@Request() req: any) {
    return this.chatsService.listConversations(req.user.id);
  }

  @Get('contacts/search')
  @ApiOperation({ summary: 'Search users available for direct chat' })
  @ApiQuery({ name: 'q', required: false, type: String })
  async searchContacts(
    @Query('q') query: string | undefined,
    @Request() req: any,
  ) {
    return this.chatsService.searchContacts(req.user.id, query);
  }

  @Post('start')
  @ApiOperation({
    summary: 'Start or reuse a direct conversation with another user',
  })
  async startConversation(
    @Body() dto: StartDirectConversationDto,
    @Request() req: any,
  ) {
    return this.chatsService.startConversation(req.user.id, dto.participantId);
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Get a direct conversation thread' })
  async findConversation(
    @Param('conversationId') conversationId: string,
    @Request() req: any,
  ) {
    return this.chatsService.findConversation(conversationId, req.user.id);
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Send a message inside a direct conversation' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async addMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateDirectMessageDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @Request() req: any,
  ) {
    return this.chatsService.addMessage(conversationId, dto, req.user.id, image);
  }
}
