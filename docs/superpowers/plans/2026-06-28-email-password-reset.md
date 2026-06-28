# 邮件基础设施 + 密码重置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭可插拔邮件传输（dev 日志 / prod SMTP），并实现「忘记/重置密码」——无枚举、令牌哈希单用、重置即撤销全部会话，两端前端齐全。

**Architecture:** 新 `mail` 模块（`MailService` 包 nodemailer，按 `SMTP_HOST` 选传输）；独立 `PasswordResetService`（复用 #2a 的 `revokeAllForUser`）；两个公开端点 `/auth/forgot-password`、`/auth/reset-password`；重置令牌 sha256 存 User 两列。前端两端各加忘记/重置页 + 登录入口。

**Tech Stack:** NestJS 10 · Prisma（User 加两列 + 迁移）· nodemailer · node crypto（sha256/randomBytes）· bcrypt · React（web antd / swimmer antd-mobile）。

## Global Constraints

- 邮件传输：`SMTP_HOST` 有值走真 SMTP；否则 `jsonTransport`（dev，不真发）并把邮件打 info 日志。
- `forgot` **恒返回 200**（无枚举），仅对存在且 `claimedAt != null` 的用户发信。
- 重置令牌 256-bit、**sha256 哈希存 User**、默认 1h、**单用**（用后清列）、**重置即 `revokeAllForUser`**。
- 重置链接按角色路由：OWNER → `CORS_ORIGIN` 首个；SWIMMER → `SWIMMER_APP_URL`；路径 `/reset-password?token=…`。
- 端点公开 + 限流（5/60s）。DTO 类放 `auth.service.ts`（与 RegisterDto 等一致，**不**进 shared）。
- 前端 `/forgot-password`、`/reset-password` 为公开路由（ProtectedRoute 之外）。
- 现有 single-flight / #2a 行为不回归；TDD：红→绿→提交，频繁提交。

---

### Task 1: 配置增项（SMTP / MAIL_FROM / PASSWORD_RESET_TTL）

**Files:**
- Modify: `apps/api/src/common/env.validation.ts`
- Test: `apps/api/src/common/env.validation.spec.ts`

**Interfaces:**
- Produces: `validateEnv` 回填 `MAIL_FROM`（默认 `no-reply@swimmingtrace.local`）、`PASSWORD_RESET_TTL`（默认 `1h`，须时长格式）；`SMTP_PORT` 若提供须为数字。`SMTP_HOST/USER/PASS/SECURE` 透传不校验。

- [ ] **Step 1: 追加失败测试**（spec 末尾 describe 内）

```ts
it('回填 MAIL_FROM 与 PASSWORD_RESET_TTL 默认', () => {
  const out = validateEnv({ ...ok });
  expect(out.MAIL_FROM).toBe('no-reply@swimmingtrace.local');
  expect(out.PASSWORD_RESET_TTL).toBe('1h');
});
it('非法 PASSWORD_RESET_TTL / SMTP_PORT 抛错', () => {
  expect(() => validateEnv({ ...ok, PASSWORD_RESET_TTL: '1hour' })).toThrow(/PASSWORD_RESET_TTL/);
  expect(() => validateEnv({ ...ok, SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/);
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- env.validation` → FAIL。

- [ ] **Step 3: 扩展 `validateEnv`**（在 `REFRESH_TOKEN_TTL` 校验之后、`return` 之前）

```ts
  const mailFrom = (config.MAIL_FROM as string) ?? 'no-reply@swimmingtrace.local';
  const resetTtl = (config.PASSWORD_RESET_TTL as string) ?? '1h';
  if (!DURATION_RE.test(resetTtl)) {
    throw new Error(`PASSWORD_RESET_TTL must be a duration like 1h; got "${resetTtl}".`);
  }
  if (config.SMTP_PORT !== undefined && !/^\d+$/.test(String(config.SMTP_PORT))) {
    throw new Error(`SMTP_PORT must be a number; got "${config.SMTP_PORT}".`);
  }
```
并在 `return { ...config, ... }` 加 `MAIL_FROM: mailFrom, PASSWORD_RESET_TTL: resetTtl,`。（`DURATION_RE` 已在 #2a 定义于本函数内，复用。）

- [ ] **Step 4: 跑测试确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/common/env.validation.ts apps/api/src/common/env.validation.spec.ts
git commit -m 'feat(api): MAIL_FROM / PASSWORD_RESET_TTL / SMTP_PORT 配置'
```

---

### Task 2: User 重置列 + 迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（User 加两列）
- Create: `apps/api/prisma/migrations/<ts>_password_reset/migration.sql`

- [ ] **Step 1: 加列**（`schema.prisma` 的 `User` 模型，`claimTokenExpiresAt` 行之后）

```prisma
  passwordResetTokenHash String?
  passwordResetExpiresAt DateTime?
```

- [ ] **Step 2: 预览迁移 SQL**

Run（`apps/api`）：`npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
Expected: 两条 `ALTER TABLE "User" ADD COLUMN`。

- [ ] **Step 3: 写迁移文件** — 建 `apps/api/prisma/migrations/20260628020000_password_reset/migration.sql`，内容为上步输出。

- [ ] **Step 4: 应用 + 生成** — `npx prisma migrate deploy && npx prisma generate`（`apps/api`）。

- [ ] **Step 5: 构建** — `npm run build -w @swim/api` → 成功。

- [ ] **Step 6: 提交**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m 'feat(db): User 密码重置令牌列（哈希 + 过期）'
```

---

### Task 3: MailService + MailModule

**Files:**
- Modify: `apps/api/package.json`（deps）
- Create: `apps/api/src/mail/mail.service.ts` · `apps/api/src/mail/mail.module.ts`
- Test: `apps/api/src/mail/mail.service.spec.ts`

**Interfaces:**
- Produces: `MailService.sendMail({to,subject,html,text?})`、`MailService.sendPasswordReset(to, resetUrl)`；`MailModule` 导出 `MailService`。

- [ ] **Step 1: 安装依赖** — `npm i -w @swim/api nodemailer && npm i -D -w @swim/api @types/nodemailer`

- [ ] **Step 2: 失败测试** `mail.service.spec.ts`

```ts
const createTransport = jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({}) });
jest.mock('nodemailer', () => ({ createTransport: (...a: unknown[]) => createTransport(...a) }));
import { MailService } from './mail.service';

const cfg = (m: Record<string, string | undefined>) => ({ get: (k: string) => m[k] }) as any;

describe('MailService', () => {
  beforeEach(() => createTransport.mockClear());

  it('SMTP_HOST 有值 → 用 SMTP 传输', () => {
    new MailService(cfg({ SMTP_HOST: 'smtp.x.com', SMTP_PORT: '587' }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x.com', port: 587 }));
  });

  it('无 SMTP_HOST → jsonTransport（dev）', () => {
    new MailService(cfg({}));
    expect(createTransport).toHaveBeenCalledWith({ jsonTransport: true });
  });

  it('sendPasswordReset 调底层 sendMail 且含 resetUrl', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    createTransport.mockReturnValueOnce({ sendMail });
    const svc = new MailService(cfg({}));
    await svc.sendPasswordReset('a@b.c', 'http://x/reset-password?token=T');
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('a@b.c');
    expect(arg.text).toContain('http://x/reset-password?token=T');
  });
});
```

- [ ] **Step 3: 跑测试确认失败** — `npm test -w @swim/api -- mail.service` → FAIL。

- [ ] **Step 4: 实现** `mail.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

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
}
```

- [ ] **Step 5: MailModule** `mail.module.ts`

```ts
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 6: 跑测试确认通过** — `npm test -w @swim/api -- mail.service` → PASS（3 用例）。

- [ ] **Step 7: 提交**

```bash
git add apps/api/package.json ../../package-lock.json apps/api/src/mail
git commit -m 'feat(api): MailService（nodemailer 可插拔 dev/SMTP）+ MailModule'
```

---

### Task 4: PasswordResetService

**Files:**
- Create: `apps/api/src/auth/password-reset.service.ts`
- Test: `apps/api/src/auth/password-reset.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`、`MailService`、`ConfigService`、`RefreshTokenService`、`parseDurationMs`。
- Produces: `forgot(email): Promise<void>`（无枚举）、`reset(token, password): Promise<void>`（无效/过期 → `BadRequestException`）。

- [ ] **Step 1: 失败测试** `password-reset.service.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('NEWHASH') }));

const cfg = { get: (k: string) => ({ PASSWORD_RESET_TTL: '1h', CORS_ORIGIN: 'http://web', SWIMMER_APP_URL: 'http://swim' })[k] } as any;

describe('PasswordResetService.forgot', () => {
  it('存在且已认领 → 写 hash + 发信（OWNER 用 web 域）', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', claimedAt: new Date() }), update } };
    const mail: any = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    await new PasswordResetService(prisma, mail, cfg, {} as any).forgot('o@x.com');
    expect(update.mock.calls[0][0].data.passwordResetTokenHash).toHaveLength(64);
    const url = mail.sendPasswordReset.mock.calls[0][1];
    expect(url).toMatch(/^http:\/\/web\/reset-password\?token=/);
  });

  it('不存在 → 不发信、正常返回', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const mail: any = { sendPasswordReset: jest.fn() };
    await new PasswordResetService(prisma, mail, cfg, {} as any).forgot('none@x.com');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('未认领 → 不发信', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 's@x.com', role: 'SWIMMER', claimedAt: null }) } };
    const mail: any = { sendPasswordReset: jest.fn() };
    await new PasswordResetService(prisma, mail, cfg, {} as any).forgot('s@x.com');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService.reset', () => {
  it('有效 → 改密 + 清列 + 撤全部会话', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() + 1e6) }), update } };
    const refresh: any = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    await new PasswordResetService(prisma, {} as any, cfg, refresh).reset('tok', 'password123');
    expect(update.mock.calls[0][0].data).toMatchObject({ passwordHash: 'NEWHASH', passwordResetTokenHash: null, passwordResetExpiresAt: null });
    expect(refresh.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('过期 → BadRequest', async () => {
    const prisma: any = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() - 1000) }) } };
    await expect(new PasswordResetService(prisma, {} as any, cfg, {} as any).reset('tok', 'password123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('无效（查无）→ BadRequest', async () => {
    const prisma: any = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new PasswordResetService(prisma, {} as any, cfg, {} as any).reset('x', 'password123')).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- password-reset.service` → FAIL。

- [ ] **Step 3: 实现** `password-reset.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { RefreshTokenService } from './refresh-token.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
    private refreshTokens: RefreshTokenService,
  ) {}

  private hash(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  /** 无枚举：无论邮箱是否存在/已认领都正常返回；仅对已认领用户发信。 */
  async forgot(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.claimedAt) return;
    const token = randomBytes(32).toString('hex');
    const ttl = parseDurationMs(this.config.get<string>('PASSWORD_RESET_TTL') ?? '1h');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: this.hash(token), passwordResetExpiresAt: new Date(Date.now() + ttl) },
    });
    const base =
      user.role === 'OWNER'
        ? (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173').split(',')[0].trim()
        : (this.config.get<string>('SWIMMER_APP_URL') ?? 'http://localhost:5174');
    await this.mail.sendPasswordReset(user.email, `${base}/reset-password?token=${token}`);
  }

  async reset(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { passwordResetTokenHash: this.hash(token) } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('重置链接无效或已过期');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    await this.refreshTokens.revokeAllForUser(user.id);
  }
}
```

- [ ] **Step 4: 跑测试确认通过** — PASS（6 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/password-reset.service.ts apps/api/src/auth/password-reset.service.spec.ts
git commit -m 'feat(api): PasswordResetService（无枚举 + 哈希单用 + 撤全部会话）'
```

---

### Task 5: 端点 + DTO + 模块装配

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`（加 `ForgotPasswordDto`/`ResetPasswordDto`）
- Modify: `apps/api/src/auth/auth.controller.ts`（两个端点）
- Modify: `apps/api/src/auth/auth.module.ts`（import `MailModule`、provide `PasswordResetService`）

**Interfaces:**
- Produces: `POST /auth/forgot-password {email}`、`POST /auth/reset-password {token,password}`，均公开、限流 5/60s、恒/正常返回 `{ok:true}`。

- [ ] **Step 1: DTO**（`auth.service.ts` DTO 区，`RefreshDto` 之后）

```ts
export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}
```

- [ ] **Step 2: 控制器端点**（`auth.controller.ts`）

- import 改：`import { AuthService, ClaimDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from './auth.service';` 并 `import { PasswordResetService } from './password-reset.service';`
- 构造函数注入：`constructor(private auth: AuthService, private passwordReset: PasswordResetService) {}`
- 在 `me` 之前加：
```ts
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.forgot(dto.email);
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordReset.reset(dto.token, dto.password);
    return { ok: true };
  }
```

- [ ] **Step 3: 模块装配**（`auth.module.ts`）

- import `MailModule`（`from '../mail/mail.module'`）与 `PasswordResetService`。
- `imports` 加 `MailModule`；`providers` 加 `PasswordResetService`。

- [ ] **Step 4: 构建 + 单测** — `npm run build -w @swim/api && npm test -w @swim/api` → 全绿。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts
git commit -m 'feat(api): /auth/forgot-password /auth/reset-password 端点'
```

---

### Task 6: 后端 e2e（无枚举 / 重置 / 撤会话）

**Files:**
- Create: `apps/api/test/password-reset.e2e-spec.ts`

**Interfaces:**
- Consumes: `overrideProvider(MailService)` 捕获 `sendPasswordReset` 的 `resetUrl`。

- [ ] **Step 1: 写 e2e**（app 初始化覆盖 MailService 捕获 URL；beforeAll 清库含 `refreshToken.deleteMany()` 先于 `user.deleteMany()`）

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { resetUrl?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: (_to: string, url: string) => { captured.resetUrl = url; return Promise.resolve(); },
        sendMail: () => Promise.resolve(),
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.refreshToken.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.swimSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(async () => { await app.close(); });
  const srv = () => app.getHttpServer();

  it('forgot 对存在与不存在邮箱都 200（无枚举）；reset 改密 + 旧密码失效 + 撤会话', async () => {
    await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' }).expect(201);

    // 不存在邮箱 → 200，且不产生链接
    captured.resetUrl = undefined;
    await request(srv()).post('/auth/forgot-password').send({ email: 'none@x.com' }).expect(201);
    expect(captured.resetUrl).toBeUndefined();

    // 存在 → 200 + 捕获链接
    await request(srv()).post('/auth/forgot-password').send({ email: 'o@x.com' }).expect(201);
    expect(captured.resetUrl).toContain('/reset-password?token=');
    const token = new URL(captured.resetUrl!).searchParams.get('token')!;

    // 重置为新密码
    await request(srv()).post('/auth/reset-password').send({ token, password: 'newpassword456' }).expect(201);

    // 旧密码失败、新密码成功
    await request(srv()).post('/auth/login').send({ email: 'o@x.com', password: 'password123' }).expect(401);
    await request(srv()).post('/auth/login').send({ email: 'o@x.com', password: 'newpassword456' }).expect(201);

    // 复用同一 token → 400
    await request(srv()).post('/auth/reset-password').send({ token, password: 'another789' }).expect(400);
  });

  it('无效 token → 400', async () => {
    await request(srv()).post('/auth/reset-password').send({ token: 'bogus', password: 'password123' }).expect(400);
  });
});
```

- [ ] **Step 2: 跑 e2e** — `npm run test:e2e` → 全绿（新文件 + 既有回归）。

- [ ] **Step 3: 提交**

```bash
git add apps/api/test/password-reset.e2e-spec.ts
git commit -m 'test(api): 密码重置 e2e（无枚举/改密/撤会话/复用拒绝）'
```

---

### Task 7: 前端 web（忘记/重置页 + 登录入口 + 路由）

**Files:**
- Create: `apps/web/src/features/auth/ForgotPasswordPage.tsx` · `apps/web/src/features/auth/ResetPasswordPage.tsx`
- Modify: `apps/web/src/features/auth/LoginPage.tsx`（加链接）· `apps/web/src/app/router.tsx`（两路由）· `apps/web/src/lib/api/endpoints.ts`（两函数）· `apps/web/src/test/msw.ts`（默认处理器）
- Test: `apps/web/src/features/auth/ForgotPasswordPage.test.tsx` · `apps/web/src/features/auth/ResetPasswordPage.test.tsx`

**Interfaces:**
- Produces: `forgotPassword(email)`、`resetPassword(token, password)` endpoints。

- [ ] **Step 1: endpoints**（`endpoints.ts`，`logout` 之后）

```ts
export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password }).then((r) => r.data);
```

- [ ] **Step 2: msw 默认处理器**（`apps/web/src/test/msw.ts` 的 handlers 数组加）

```ts
  http.post('/api/auth/forgot-password', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/reset-password', () => HttpResponse.json({ ok: true })),
```

- [ ] **Step 3: 失败测试** `ForgotPasswordPage.test.tsx`

```ts
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { ForgotPasswordPage } from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  it('提交后显示通用提示（不泄露是否存在）', async () => {
    renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
    await userEvent.type(screen.getByLabelText('邮箱'), 'o@x.com');
    await userEvent.click(screen.getByRole('button', { name: /发送/ }));
    await waitFor(() => expect(screen.getByText(/若该邮箱已注册/)).toBeInTheDocument());
  });
});
```
> 注：`renderWithProviders` 的具体签名以本仓 `apps/web/src/test/render` 既有用法为准（路由/Query/AntD App 包裹）。`ResetPasswordPage.test.tsx` 同构：渲染于 `/reset-password?token=T`，填密码+确认→点重置→`waitFor` 断言跳转 `/login`（用既有 render 的路由断言方式）。

- [ ] **Step 4: 跑测试确认失败** — `npm test -w @swim/web -- ForgotPasswordPage` → FAIL（组件不存在）。

- [ ] **Step 5: 实现页面**

`ForgotPasswordPage.tsx`：
```tsx
import { useState } from 'react';
import { Button, Card, Form, Input, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../lib/api/endpoints';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { email: string }) => {
    setLoading(true);
    try {
      await forgotPassword(v.email);
      setSent(true);
    } catch {
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="找回密码" style={{ width: 360 }}>
        {sent ? (
          <>
            <p>若该邮箱已注册，重置链接已发送，请查收。</p>
            <Button block onClick={() => navigate('/login')}>返回登录</Button>
          </>
        ) : (
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} autoInsertSpace={false}>发送重置链接</Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
```

`ResetPasswordPage.tsx`：
```tsx
import { useState } from 'react';
import { Button, Card, Form, Input, App } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../lib/api/endpoints';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { password: string; confirm: string }) => {
    if (v.password !== v.confirm) { message.error('两次密码不一致'); return; }
    setLoading(true);
    try {
      await resetPassword(token, v.password);
      message.success('密码已重置，请用新密码登录');
      navigate('/login');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '重置失败，链接可能已失效');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ paddingTop: 80, textAlign: 'center' }}>链接无效</div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="重置密码" style={{ width: 360 }}>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirm" label="确认新密码" rules={[{ required: true, message: '请再次输入' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} autoInsertSpace={false}>重置密码</Button>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: 登录页加链接**（`LoginPage.tsx`，密码 `Form.Item` 之后、提交按钮之前加）

```tsx
          <div style={{ textAlign: 'right', marginBottom: 8 }}>
            <a onClick={() => navigate('/forgot-password')}>忘记密码？</a>
          </div>
```

- [ ] **Step 7: 路由**（`router.tsx`，`/login` 行之后加两公开路由）

```tsx
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
```
并 import 两页面。

- [ ] **Step 8: 跑 web 全量单测** — `npm test -w @swim/web` → 全绿（含两新测）。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src
git commit -m 'feat(web): 忘记/重置密码页 + 登录入口 + 路由'
```

---

### Task 8: 前端 swimmer（忘记/重置页 + 登录入口 + 路由）

**Files:**
- Create: `apps/swimmer/src/features/auth/ForgotPasswordPage.tsx` · `apps/swimmer/src/features/auth/ResetPasswordPage.tsx`
- Modify: `apps/swimmer/src/features/auth/LoginPage.tsx` · `apps/swimmer/src/app/router.tsx` · `apps/swimmer/src/lib/api/endpoints.ts` · `apps/swimmer/src/test/msw.ts`
- Test: `apps/swimmer/src/features/auth/ForgotPasswordPage.test.tsx`

**Interfaces:** 同 Task 7，UI 用 `antd-mobile`。

- [ ] **Step 1: endpoints**（swimmer `endpoints.ts`，`logout` 之后）—— 同 Task 7 Step 1 代码。

- [ ] **Step 2: msw 默认处理器**（swimmer `test/msw.ts` 的 handlers 加）—— 同 Task 7 Step 2 两行。

- [ ] **Step 3: 失败测试** `ForgotPasswordPage.test.tsx`

```ts
import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { ForgotPasswordPage } from './ForgotPasswordPage';

it('提交后显示通用提示', async () => {
  renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
  await userEvent.type(screen.getByPlaceholderText('邮箱'), 'o@x.com');
  await userEvent.click(screen.getByText('发送重置链接'));
  await waitFor(() => expect(screen.getByText(/若该邮箱已注册/)).toBeInTheDocument());
});
```
> `renderWithProviders` 签名以 swimmer 既有 `src/test/render` 为准。

- [ ] **Step 4: 跑测试确认失败** — `npm test -w @swim/swimmer -- ForgotPasswordPage` → FAIL。

- [ ] **Step 5: 实现页面**（antd-mobile 版）

`ForgotPasswordPage.tsx`：
```tsx
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../lib/api/endpoints';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: { email: string }) => {
    setLoading(true);
    try {
      await forgotPassword(v.email);
      setSent(true);
    } catch {
      Toast.show({ content: '操作失败' });
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <div style={{ padding: 16 }}>
        <p>若该邮箱已注册，重置链接已发送，请查收。</p>
        <Button block onClick={() => navigate('/login')}>返回登录</Button>
      </div>
    );

  return (
    <div style={{ padding: 16 }}>
      <h2>找回密码</h2>
      <Form onFinish={onFinish} footer={<Button block type="submit" color="primary" loading={loading}>发送重置链接</Button>}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
          <Input placeholder="邮箱" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
```

`ResetPasswordPage.tsx`：
```tsx
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../lib/api/endpoints';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: { password: string; confirm: string }) => {
    if (v.password !== v.confirm) { Toast.show({ content: '两次密码不一致' }); return; }
    setLoading(true);
    try {
      await resetPassword(token, v.password);
      Toast.show({ content: '密码已重置，请用新密码登录' });
      navigate('/login');
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '重置失败，链接可能已失效' });
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ padding: 16 }}>链接无效</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>重置密码</h2>
      <Form onFinish={onFinish} footer={<Button block type="submit" color="primary" loading={loading}>重置密码</Button>}>
        <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
          <Input type="password" placeholder="新密码（≥8）" clearable />
        </Form.Item>
        <Form.Item name="confirm" label="确认" rules={[{ required: true, message: '请再次输入' }]}>
          <Input type="password" placeholder="再次输入" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
```

- [ ] **Step 6: 登录页加链接**（swimmer `LoginPage.tsx`，Form 之后加）

```tsx
      <div style={{ padding: '8px 16px', textAlign: 'right' }}>
        <a onClick={() => navigate('/forgot-password')}>忘记密码？</a>
      </div>
```
（确认 `navigate` 已从 `useNavigate()` 取得——已存在。）

- [ ] **Step 7: 路由**（swimmer `router.tsx`，`/login` 行之后加两公开路由 + import 页面）

```tsx
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
```

- [ ] **Step 8: 跑 swimmer 全量单测** — `npm test -w @swim/swimmer` → 全绿。

- [ ] **Step 9: 提交**

```bash
git add apps/swimmer/src
git commit -m 'feat(swimmer): 忘记/重置密码页 + 登录入口 + 路由'
```

---

### Task 9: 终验 + README + .env.example + 自评审 + 通知

**Files:**
- Modify: `README.md` · `apps/api/.env.example`

- [ ] **Step 1: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿；逐项修复。

- [ ] **Step 2: 实跑链路**（本地起 api，无 SMTP 配置）：`POST /auth/forgot-password {email:owner@swim.dev}` → 看 api 日志取 `[DEV MAIL]` 里的 reset 链接 → `POST /auth/reset-password {token,password}` → 旧密码登录 401、新密码 201。

- [ ] **Step 3: .env.example 增项** — 加注释块：`MAIL_FROM`、`SMTP_HOST/PORT/USER/PASS/SECURE`（留空走 dev 日志传输）、`PASSWORD_RESET_TTL=1h`。

- [ ] **Step 4: README** — 鉴权小节补「忘记/重置密码（无枚举、令牌哈希单用、重置撤全部会话）」；接口一览加 `POST /auth/forgot-password`、`/auth/reset-password`；加「邮件」说明（dev 日志 / prod SMTP）。

- [ ] **Step 5: 自评审** — `forgot` 恒 200（含不存在）；reset 撤会话；dev 不真发信；reset token 只存 hash；两端入口/页齐全；既有断言全过。

- [ ] **Step 6: 提交 + 通知验收**

```bash
git add README.md apps/api/.env.example
git commit -m 'docs: 邮件 + 密码重置（鉴权/接口/邮件配置/.env）'
```
通知用户 #2b 完成 + 全量门禁绿 + 摘要 + 后续（#2c 邮箱验证 / #2d 认领发信 …）。

## Self-Review（plan vs spec）

- **Spec coverage**：邮件传输(T3) · 重置流程/无枚举/撤会话(T4) · 端点(T5) · User 列/迁移(T2) · 配置(T1) · e2e(T6) · 两端前端(T7/T8) · README/.env(T9) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；FE 测试对 `renderWithProviders` 的签名标注「以既有 render 用法为准」并给出意图，实现时照既有写法落地（非占位）。
- **Type consistency**：`MailService.sendPasswordReset(to,resetUrl)`、`PasswordResetService.forgot(email)`/`reset(token,password)`、endpoints `forgotPassword(email)`/`resetPassword(token,password)` 跨任务一致。
- **偏差（对 spec 的小调整）**：DTO 放 `auth.service.ts`（与既有 auth DTO 一致），**不**进 `@swim/shared`（FE 用基本类型，YAGNI）。
- **风险**：register 建 refresh 行 → e2e 清库已含 `refreshToken.deleteMany()` 先行（T6）。
