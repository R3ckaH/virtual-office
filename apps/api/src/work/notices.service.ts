import { Inject, Injectable } from '@nestjs/common';
import type { NotificationKind } from '@vo/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import { User, users } from '../db/schema';
import { actionEmail, MailService } from '../mail/mail.service';
import { PresenceService } from '../presence/presence.service';
import { SettingsService } from '../settings/settings.service';

/** In-app pop-ups (live) plus, when that kind of email is switched on, an email. */
@Injectable()
export class NoticesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly presence: PresenceService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  async send(
    to: Pick<User, 'id' | 'email' | 'fullName'>[],
    n: { kind: NotificationKind; title: string; body: string; link: string; actionLabel: string; subject: string; footer: string },
  ) {
    const emailOn = await this.settings.notifies(n.kind);
    const { companyName } = await this.settings.get();
    for (const u of to) {
      this.presence.notify(u.id, 'notice', { title: n.title, body: n.body, link: n.link });
      if (!emailOn) continue;
      const mail = actionEmail({
        companyName,
        greeting: `Hi ${u.fullName.split(' ')[0]},`,
        body: n.body,
        actionLabel: n.actionLabel,
        actionUrl: `${env().WEB_ORIGIN}${n.link}`,
        footer: n.footer,
      });
      await this.mail.send({ to: u.email, subject: n.subject, ...mail });
    }
  }

  /** HR, or the admins when there's no HR. */
  async hrPeople() {
    const hr = await this.db.select().from(users).where(and(eq(users.role, 'HR'), eq(users.status, 'ACTIVE')));
    if (hr.length) return hr;
    return this.db.select().from(users).where(and(inArray(users.role, ['ADMIN']), eq(users.status, 'ACTIVE')));
  }
}
