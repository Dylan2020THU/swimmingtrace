import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Pluggable mail transport: real SMTP when SMTP_HOST is set, otherwise a dev
 * jsonTransport that never sends — the message (incl. any reset link) is logged
 * so local/demo flows can read it straight from the logs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly devMode: boolean;

  constructor(config: ConfigService) {
    this.from = config.get<string>('MAIL_FROM') ?? 'no-reply@swimmingtrace.local';
    const host = config.get<string>('SMTP_HOST');
    if (host) {
      this.devMode = false;
      const user = config.get<string>('SMTP_USER');
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(config.get<string>('SMTP_PORT') ?? '587'),
        secure: config.get<string>('SMTP_SECURE') === 'true',
        auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
      });
    } else {
      this.devMode = true;
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  async sendMail(opts: MailOptions): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...opts });
    if (this.devMode) {
      this.logger.log(`[DEV MAIL] to=${opts.to} subject=${opts.subject}\n${opts.text ?? opts.html}`);
    }
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: '重置你的 SwimmingTrace 密码',
      html: `<p>点击以下链接重置密码（1 小时内有效）：</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      text: `重置密码（1 小时内有效）：${resetUrl}`,
    });
  }

  async sendClaimLink(to: string, claimUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: '你被邀请加入 SwimmingTrace 泳池',
      html: `<p>泳池主邀请你加入。点击设置密码并登录（7 天内有效）：</p><p><a href="${claimUrl}">${claimUrl}</a></p>`,
      text: `加入泳池（7 天内有效）：${claimUrl}`,
    });
  }
}
