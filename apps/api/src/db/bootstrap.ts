/**
 * First-run setup for a real deployment: names the company and creates the first Admin.
 * Runs on every container start, but does nothing unless BOOTSTRAP_ADMIN_EMAIL is set
 * AND no Admin exists yet, so it can never overwrite a real account.
 *
 *   BOOTSTRAP_COMPANY_NAME="Covenant Creators"
 *   BOOTSTRAP_ADMIN_EMAIL=you@yourcompany.com
 *   BOOTSTRAP_ADMIN_NAME="Your Name"
 *   BOOTSTRAP_ADMIN_PASSWORD=...   (remove these variables after the first sign-in)
 */
import 'dotenv/config';
import { passwordSchema } from '@vo/shared';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/auth.service';
import { createDb, createPool } from './client';
import { auditLogs, orgSettings, users } from './schema';

export async function bootstrap(e: NodeJS.ProcessEnv = process.env): Promise<'skipped' | 'exists' | 'created'> {
  const email = e.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return 'skipped';
  const name = e.BOOTSTRAP_ADMIN_NAME?.trim() || email.split('@')[0];
  const password = e.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${pw.error.issues.map((i) => i.message).join('; ')}`);

  const pool = createPool(e.DATABASE_URL!);
  const db = createDb(pool);
  try {
    return await db.transaction(async (tx) => {
      // Serialize concurrent starts (two replicas booting at once).
      await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
      const [admin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'ADMIN')).limit(1);
      if (admin) return 'exists' as const;

      const company = e.BOOTSTRAP_COMPANY_NAME?.trim();
      await tx
        .insert(orgSettings)
        .values({ id: 1, ...(company ? { companyName: company } : {}) })
        .onConflictDoUpdate({ target: orgSettings.id, set: company ? { companyName: company } : { id: 1 } });

      const [row] = await tx
        .insert(users)
        .values({ email, fullName: name, role: 'ADMIN', passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
        .onConflictDoUpdate({ target: users.email, set: { role: 'ADMIN', status: 'ACTIVE', deactivatedAt: null } })
        .returning({ id: users.id });
      await tx.insert(auditLogs).values({
        actorId: null,
        action: 'system.bootstrap_admin',
        entityType: 'user',
        entityId: row.id,
        after: { email, role: 'ADMIN', companyName: company ?? null },
      });
      return 'created' as const;
    });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  bootstrap()
    .then((r) => {
      if (r === 'created') console.log('Bootstrap: created the first Admin. Remove the BOOTSTRAP_* variables now.');
      if (r === 'exists') console.log('Bootstrap: an Admin already exists; nothing changed. You can remove the BOOTSTRAP_* variables.');
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
