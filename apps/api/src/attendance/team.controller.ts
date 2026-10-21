import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  dateQuerySchema,
  decisionSchema,
  listCorrectionsQuerySchema,
  type DateQuery,
  type DecisionInput,
  type ListCorrectionsQuery,
} from '@vo/shared';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import { DB, Db } from '../db/client';
import { User, users } from '../db/schema';
import { BoardService } from './board.service';
import { CorrectionsService } from './corrections.service';
import { ExceptionsService } from './exceptions.service';

/** Managers: their direct reports' attendance, and the first approval of their correction requests. */
@Controller('team')
@RequirePermissions('team.read')
export class TeamController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly board: BoardService,
    private readonly corrections: CorrectionsService,
    private readonly exceptions: ExceptionsService,
  ) {}

  private async reports(manager: User): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.managerId, manager.id), eq(users.status, 'ACTIVE')));
    return rows.map((r) => r.id);
  }

  @Get('board')
  async teamBoard(@Query(new ZodPipe(dateQuerySchema)) q: DateQuery, @CurrentUser() me: User) {
    return this.board.board(q.date, await this.reports(me));
  }

  @Get('live')
  async live(@CurrentUser() me: User) {
    return this.board.live(8, await this.reports(me));
  }

  @Get('exceptions')
  async teamExceptions(@CurrentUser() me: User) {
    return this.exceptions.list({ status: 'OPEN' }, await this.reports(me));
  }

  @Get('people/:userId/day')
  async day(@Param('userId', ParseUUIDPipe) userId: string, @Query(new ZodPipe(dateQuerySchema)) q: DateQuery, @CurrentUser() me: User) {
    if (!(await this.reports(me)).includes(userId)) throw new NotFoundException('Person not found');
    return this.board.detail(userId, q.date);
  }

  @Get('corrections')
  list(@Query(new ZodPipe(listCorrectionsQuerySchema)) q: ListCorrectionsQuery, @CurrentUser() me: User) {
    return this.corrections.forManager(me.id, q.status);
  }

  @Post('corrections/:id/decision')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionSchema)) body: DecisionInput,
    @CurrentUser() me: User,
    @Req() req: Request,
  ) {
    return this.corrections.managerDecision(id, body, me, req.ip ?? null);
  }
}
