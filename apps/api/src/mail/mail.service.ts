import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** e.g. a calendar invite (.ics) */
  attachments?: { filename: string; content: string; contentType: string }[];
  /** for invites: also send the calendar part inline so mail apps show Accept / Decline */
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string };
}

/**
 * Sends email over SMTP (Azure Communication Services, SendGrid, etc.).
 * With no SMTP_HOST configured (local dev), emails are printed to the console instead.
 * Tests read `outbox` to follow links.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter?: Transporter;
  readonly outbox: OutgoingMail[] = [];

  private getTransport(): Transporter | undefined {
    const e = env();
    if (!e.SMTP_HOST) return undefined;
    this.transporter ??= nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
    return this.transporter;
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (env().NODE_ENV === 'test') {
      this.outbox.push(mail);
      return;
    }
    const transport = this.getTransport();
    if (!transport) {
      const extra = mail.attachments?.length ? `\n[attachments: ${mail.attachments.map((a) => a.filename).join(', ')}]` : '';
      this.logger.log(`\n--- EMAIL (dev) ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}${extra}\n-------------------`);
      return;
    }
    try {
      await transport.sendMail({ from: env().MAIL_FROM, ...mail });
    } catch (err) {
      // Email failures must not break the request (e.g. forgot-password must not reveal anything).
      this.logger.error(`Failed to send "${mail.subject}" to ${mail.to}: ${(err as Error).message}`);
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether real email is configured (otherwise emails go to the log). */
export function mailConfigured(): boolean {
  return !!env().SMTP_HOST;
}

export function actionEmail(opts: {
  companyName: string;
  greeting: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
}): { text: string; html: string } {
  const text = `${opts.greeting}\n\n${opts.body}\n\n${opts.actionLabel}: ${opts.actionUrl}\n\n${opts.footer}\n\n${opts.companyName} Virtual Office`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
<p>${esc(opts.greeting)}</p><p>${esc(opts.body)}</p>
<p><a href="${esc(opts.actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(opts.actionLabel)}</a></p>
<p style="color:#555;font-size:13px">${esc(opts.footer)}</p>
<p style="color:#555;font-size:13px">${esc(opts.companyName)} Virtual Office</p></body></html>`;
  return { text, html };
}
