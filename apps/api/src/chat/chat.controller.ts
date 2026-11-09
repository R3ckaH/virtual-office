import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  createChannelSchema,
  editMessageSchema,
  membersSchema,
  messagesQuerySchema,
  openDmSchema,
  reactSchema,
  readSchema,
  searchSchema,
  sendMessageSchema,
  updateChannelSchema,
  type CreateChannelInput,
  type EditMessageInput,
  type MembersInput,
  type MessagesQuery,
  type OpenDmInput,
  type ReactInput,
  type ReadInput,
  type SearchInput,
  type SendMessageInput,
  type UpdateChannelInput,
} from '@vo/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('me')
  me(@CurrentUser() me: User) {
    return this.chat.me(me);
  }

  /* ---- channels ---- */

  @Get('channels')
  list(@CurrentUser() me: User) {
    return this.chat.list(me);
  }

  @Get('channels/browse')
  browse(@CurrentUser() me: User) {
    return this.chat.browse(me);
  }

  @Post('channels')
  create(@CurrentUser() me: User, @Body(new ZodPipe(createChannelSchema)) body: CreateChannelInput) {
    return this.chat.create(me, body);
  }

  @Post('dms')
  @HttpCode(200)
  openDm(@CurrentUser() me: User, @Body(new ZodPipe(openDmSchema)) body: OpenDmInput) {
    return this.chat.openDm(me, body.userIds);
  }

  @Get('channels/:id')
  channel(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.channel(me, id);
  }

  @Patch('channels/:id')
  update(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateChannelSchema)) body: UpdateChannelInput) {
    return this.chat.update(me, id, body);
  }

  @Post('channels/:id/archive')
  @HttpCode(204)
  archive(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.archive(me, id);
  }

  @Get('channels/:id/members')
  members(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.members(me, id);
  }

  @Post('channels/:id/members')
  @HttpCode(200)
  addMembers(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(membersSchema)) body: MembersInput) {
    return this.chat.addMembers(me, id, body.userIds);
  }

  @Delete('channels/:id/members/:userId')
  @HttpCode(204)
  removeMember(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.chat.removeMember(me, id, userId);
  }

  @Post('channels/:id/join')
  @HttpCode(200)
  join(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.join(me, id);
  }

  @Post('channels/:id/leave')
  @HttpCode(204)
  leave(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.removeMember(me, id, me.id);
  }

  @Post('channels/:id/read')
  @HttpCode(204)
  @SkipThrottle()
  read(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(readSchema)) body: ReadInput) {
    return this.chat.markRead(me, id, body.seq);
  }

  /* ---- messages ---- */

  @Get('channels/:id/messages')
  @SkipThrottle()
  messages(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(messagesQuerySchema)) q: MessagesQuery) {
    return this.chat.messages(me, id, q);
  }

  @Post('channels/:id/messages')
  send(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput) {
    return this.chat.send(me, id, body);
  }

  @Put('messages/:id')
  edit(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(editMessageSchema)) body: EditMessageInput) {
    return this.chat.edit(me, id, body);
  }

  @Delete('messages/:id')
  @HttpCode(204)
  remove(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.remove(me, id);
  }

  @Post('messages/:id/reactions')
  @HttpCode(200)
  react(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reactSchema)) body: ReactInput) {
    return this.chat.react(me, id, body.emoji, true);
  }

  @Delete('messages/:id/reactions/:emoji')
  unreact(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Param('emoji') emoji: string) {
    return this.chat.react(me, id, emoji, false);
  }

  @Post('messages/:id/pin')
  @HttpCode(200)
  pin(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.pin(me, id, true);
  }

  @Delete('messages/:id/pin')
  unpin(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.pin(me, id, false);
  }

  @Get('announcements')
  announcements(@CurrentUser() me: User) {
    return this.chat.announcements(me);
  }

  @Get('search')
  search(@CurrentUser() me: User, @Query(new ZodPipe(searchSchema)) q: SearchInput) {
    return this.chat.search(me, q.q, q.channelId);
  }

  /* ---- files ---- */

  /** The raw file is the request body; its name comes in the `name` query parameter. */
  @Post('files')
  upload(@CurrentUser() me: User, @Query('name') name: string, @Req() req: Request) {
    return this.chat.upload(me, String(name ?? ''), req.body as Buffer);
  }

  /** Signed links only (images load in <img>, which can't send the access token). */
  @Public()
  @SkipThrottle()
  @Get('files/:id')
  async download(@Param('id', ParseUUIDPipe) id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response, @Headers('if-none-match') etag?: string) {
    if (!this.chat.verifyFileLink(id, Number(exp), String(sig ?? ''))) throw new NotFoundException('This link has expired. Reopen the conversation to get a fresh one.');
    const f = await this.chat.file(id);
    if (!f.messageId) throw new NotFoundException('File not found');
    const tag = `"${f.sha256}"`;
    res.setHeader('ETag', tag);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (etag === tag) return res.status(304).end();
    const inline = /^(image\/(png|jpeg|gif|webp)|application\/pdf|audio\/|video\/)/.test(f.contentType);
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Length', String(f.size));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.end(f.data);
  }
}
