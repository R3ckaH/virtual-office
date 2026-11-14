import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_NOTIFICATIONS, NotificationKind } from '@vo/shared';
import { eq } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import { orgSettings } from '../db/schema';

export type OrgSettings = typeof orgSettings.$inferSelect;

/** Company-wide settings (single row). Cached briefly because every request checks the idle timeout. */
@Injectable()
export class SettingsService {
  private cache?: { value: OrgSettings; at: number };
  private static readonly TTL_MS = 30_000;

  constructor(@Inject(DB) private readonly db: Db) {}

  async get(): Promise<OrgSettings> {
    if (this.cache && Date.now() - this.cache.at < SettingsService.TTL_MS) return this.cache.value;
    let [row] = await this.db.select().from(orgSettings).where(eq(orgSettings.id, 1));
    if (!row) {
      [row] = await this.db.insert(orgSettings).values({ id: 1 }).onConflictDoNothing().returning();
      row ??= (await this.db.select().from(orgSettings).where(eq(orgSettings.id, 1)))[0];
    }
    this.cache = { value: row, at: Date.now() };
    return row;
  }

  /** Is this kind of email switched on (Admin → Company settings → Notifications)? */
  async notifies(kind: NotificationKind): Promise<boolean> {
    const n = (await this.get()).notifications;
    return n?.[kind] ?? DEFAULT_NOTIFICATIONS[kind];
  }

  invalidate() {
    this.cache = undefined;
  }
}
