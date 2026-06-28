# 邮箱验证（软门禁）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OWNER 自助注册后发邮箱验证链接、记录 `emailVerifiedAt`，软门禁（不拦登录，owner 控制台横幅提示 + 重发）；认领游泳者认领时自动已验证。

**Architecture:** 新 `EmailVerificationService`（复用 #2b `MailService`）；register 调它发信、claim 置 `emailVerifiedAt`；`jwt.strategy.validate`（本就查库）的返回**追加** `emailVerifiedAt`，使 `/auth/me` 实时带验证态；两个端点 verify-email/resend-verification；前端仅 owner 控制台加横幅 + 验证页。

**Tech Stack:** NestJS 10 · Prisma（User 加三列 + 迁移）· nodemailer（经 MailService）· node crypto · React（web antd）。

## Global Constraints

- 验证令牌 256-bit、**sha256 哈希存 User**、默认 24h、**单用**（验证后清列）。
- **软门禁**：登录/越权不因未验证受影响，仅横幅提示。
- register（OWNER 自助）发验证信；claim（SWIMMER）`emailVerifiedAt = now()` 自动验证。
- 验证链接走 web（`CORS_ORIGIN` 首个）——仅 OWNER 自助注册。
- `verify-email` 公开 + 限流；`resend-verification` 需 `JwtAuthGuard` + 限流。
- swimmer 端不动；`MeResponse` 加可空 `emailVerifiedAt`。
- 现有 120+ 单测 / 17 e2e 不回归；TDD：红→绿→提交。

---

### Task 1: 配置 `EMAIL_VERIFY_TTL`

**Files:**
- Modify: `apps/api/src/common/env.validation.ts`
- Test: `apps/api/src/common/env.validation.spec.ts`

- [ ] **Step 1: 追加失败测试**（spec describe 内）

```ts
it('回填 EMAIL_VERIFY_TTL 默认 24h；非法抛错', () => {
  expect(validateEnv({ ...ok }).EMAIL_VERIFY_TTL).toBe('24h');
  expect(() => validateEnv({ ...ok, EMAIL_VERIFY_TTL: '24hours' })).toThrow(/EMAIL_VERIFY_TTL/);
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- env.validation` → FAIL。

- [ ] **Step 3: 扩展 `validateEnv`**（在 `resetTtl` 校验后、`return` 前）

```ts
  const verifyTtl = (config.EMAIL_VERIFY_TTL as string) ?? '24h';
  if (!DURATION_RE.test(verifyTtl)) {
    throw new Error(`EMAIL_VERIFY_TTL must be a duration like 24h; got "${verifyTtl}".`);
  }
```
并在 `return { ...config, ... }` 加 `EMAIL_VERIFY_TTL: verifyTtl,`。

- [ ] **Step 4: 跑测试确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/common/env.validation.ts apps/api/src/common/env.validation.spec.ts
git commit -m 'feat(api): EMAIL_VERIFY_TTL 配置'
```

---

### Task 2: User 验证列 + 迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_email_verify/migration.sql`

- [ ] **Step 1: 加列**（`User` 模型，`passwordResetExpiresAt` 行之后）

```prisma
  emailVerifiedAt      DateTime?
  emailVerifyTokenHash String?
  emailVerifyExpiresAt DateTime?
```

- [ ] **Step 2: 预览迁移 SQL** — `cd apps/api && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`（三条 ADD COLUMN）。

- [ ] **Step 3: 写迁移文件** — `apps/api/prisma/migrations/20260628030000_email_verify/migration.sql`，内容为上步输出。

- [ ] **Step 4: 应用 + 生成** — `cd apps/api && npx prisma migrate deploy && npx prisma generate`。

- [ ] **Step 5: 构建** — `npm run build -w @swim/api` → 成功。

- [ ] **Step 6: 提交**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m 'feat(db): User 邮箱验证列（已验证时间 + 令牌哈希 + 过期）'
```

---

### Task 3: `EmailVerificationService`

**Files:**
- Create: `apps/api/src/auth/email-verification.service.ts`
- Test: `apps/api/src/auth/email-verification.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`、`MailService`、`ConfigService`、`parseDurationMs`、`Role`。
- Produces:
  - `sendVerification(userId: string, email: string, role: Role): Promise<void>`
  - `verify(token: string): Promise<void>`（无效/过期 → `BadRequestException`）
  - `resend(userId: string): Promise<void>`（已验证则静默）

- [ ] **Step 1: 失败测试** `email-verification.service.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

const cfg = { get: (k: string) => ({ EMAIL_VERIFY_TTL: '24h', CORS_ORIGIN: 'http://web' })[k] } as never;

describe('EmailVerificationService', () => {
  it('sendVerification 写 hash + 发信（含 web verify 链接）', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { update } };
    const mail: any = { sendMail: jest.fn().mockResolvedValue(undefined) };
    await new EmailVerificationService(prisma, mail, cfg).sendVerification('u1', 'o@x.com', 'OWNER' as never);
    expect(update.mock.calls[0][0].data.emailVerifyTokenHash).toHaveLength(64);
    const body = mail.sendMail.mock.calls[0][0];
    expect(body.to).toBe('o@x.com');
    expect(body.text).toMatch(/http:\/\/web\/verify-email\?token=/);
  });

  it('verify 有效 → 置 emailVerifiedAt + 清列', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', emailVerifyExpiresAt: new Date(Date.now() + 1e6) }), update },
    };
    await new EmailVerificationService(prisma, {} as never, cfg).verify('tok');
    const data = update.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ emailVerifyTokenHash: null, emailVerifyExpiresAt: null });
  });

  it('verify 过期/无效 → BadRequest', async () => {
    const expired: any = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', emailVerifyExpiresAt: new Date(Date.now() - 1000) }) } };
    await expect(new EmailVerificationService(expired, {} as never, cfg).verify('t')).rejects.toBeInstanceOf(BadRequestException);
    const none: any = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new EmailVerificationService(none, {} as never, cfg).verify('t')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resend 已验证 → 不发信；未验证 → 发信', async () => {
    const mail: any = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const verified: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', emailVerifiedAt: new Date() }) } };
    await new EmailVerificationService(verified, mail, cfg).resend('u1');
    expect(mail.sendMail).not.toHaveBeenCalled();

    const update = jest.fn().mockResolvedValue({});
    const unverified: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', emailVerifiedAt: null }), update } };
    await new EmailVerificationService(unverified, mail, cfg).resend('u1');
    expect(mail.sendMail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- email-verification.service` → FAIL。

- [ ] **Step 3: 实现** `email-verification.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class EmailVerificationService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private hash(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  async sendVerification(userId: string, email: string, _role: Role): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const ttl = parseDurationMs(this.config.get<string>('EMAIL_VERIFY_TTL') ?? '24h');
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifyTokenHash: this.hash(token), emailVerifyExpiresAt: new Date(Date.now() + ttl) },
    });
    // Only OWNER self-registers; verification always lands on the web console.
    const web = (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173').split(',')[0].trim();
    const url = `${web}/verify-email?token=${token}`;
    await this.mail.sendMail({
      to: email,
      subject: '验证你的 SwimmingTrace 邮箱',
      html: `<p>点击验证你的邮箱（24 小时内有效）：</p><p><a href="${url}">${url}</a></p>`,
      text: `验证邮箱（24 小时内有效）：${url}`,
    });
  }

  async verify(token: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { emailVerifyTokenHash: this.hash(token) } });
    if (!user || !user.emailVerifyExpiresAt || user.emailVerifyExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('验证链接无效或已过期');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
    });
  }

  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.email, user.role);
  }
}
```
> `_role` 入参保留以备将来按角色路由；当前仅 OWNER 自助注册，固定 web 域。

- [ ] **Step 4: 跑测试确认通过** — PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/email-verification.service.ts apps/api/src/auth/email-verification.service.spec.ts
git commit -m 'feat(api): EmailVerificationService（哈希 24h 单用 + 重发）'
```

---

### Task 4: Auth 接线（register 发验证 + claim 自动验证 + me 带 emailVerifiedAt）

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`（构造注入 + register/claim）
- Modify: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/jwt.strategy.ts:24`（返回加 `emailVerifiedAt`）
- Modify: `apps/api/src/auth/auth.controller.ts:me`（类型注解加字段）
- Modify: `packages/shared/src/index.ts`（`MeResponse` 加 `emailVerifiedAt`）
- Modify: `apps/api/src/auth/auth.module.ts`（providers 加 `EmailVerificationService`）

**Interfaces:**
- Consumes: `EmailVerificationService.sendVerification`。
- Produces: `AuthService` 构造签名 `(prisma, jwt, refreshTokens, emailVerification)`；`/auth/me` 响应含 `emailVerifiedAt`。

- [ ] **Step 1: shared 改 `MeResponse`** — `export interface MeResponse { id: string; email: string; role: Role; }` → 末尾加 `emailVerifiedAt: string | null;`，然后 `npm run build -w @swim/shared`。

- [ ] **Step 2: 改 auth.service.spec.ts**

- 顶部加：`const mkEmailVerify = () => ({ sendVerification: jest.fn().mockResolvedValue(undefined), verify: jest.fn(), resend: jest.fn() }) as any;`
- 全局替换 `mkRefresh())` → `mkRefresh(), mkEmailVerify())`（覆盖 `new AuthService(prisma, mkJwt(), mkRefresh())` 与 `new AuthService(prisma, jwt, mkRefresh())` 两式）。
- register「新用户」测试：把该处实例化改为持有 stub 并断言发信——
```ts
    const ev = mkEmailVerify();
    const svc = new AuthService(prisma, mkJwt(), mkRefresh(), ev);
    const res = await svc.register({ email: 'a@b.c', password: 'password123' });
    expect(ev.sendVerification).toHaveBeenCalledWith('u1', 'a@b.c', 'SWIMMER');
```
- claim 测试：在 `data` 断言追加 `expect(data.emailVerifiedAt).toBeInstanceOf(Date);`。

- [ ] **Step 3: 跑测试确认失败** — `npm test -w @swim/api -- auth.service` → FAIL（构造参数/断言）。

- [ ] **Step 4: 改 `auth.service.ts`**

- import 加 `import { EmailVerificationService } from './email-verification.service';`
- 构造函数加第四参 `private emailVerification: EmailVerificationService,`。
- register：在 `const user = await this.prisma.user.create({...});` 之后、`return this.issueSession(user);` 之前插入：
```ts
    await this.emailVerification.sendVerification(user.id, user.email, user.role);
```
- claim：`update` 的 `data` 加 `emailVerifiedAt: new Date(),`（认领自动验证）。

- [ ] **Step 5: jwt.strategy 返回加字段**（`jwt.strategy.ts:24`）

```ts
    return { id: user.id, email: user.email, role: user.role, emailVerifiedAt: user.emailVerifiedAt };
```

- [ ] **Step 6: me 控制器类型注解**（`auth.controller.ts` 的 `me`）

```ts
  me(@CurrentUser() user: { id: string; email: string; role: string; emailVerifiedAt: Date | null }) {
    return user;
  }
```

- [ ] **Step 7: 模块装配** — `auth.module.ts`：import `EmailVerificationService`，`providers` 加之。

- [ ] **Step 8: 构建 + 单测** — `npm run build -w @swim/shared && npm run build -w @swim/api && npm test -w @swim/api` → 全绿。

- [ ] **Step 9: 提交**

```bash
git add packages/shared/src/index.ts apps/api/src/auth
git commit -m 'feat(api): register 发验证 + claim 自动验证 + /auth/me 带 emailVerifiedAt'
```

---

### Task 5: 端点（verify-email / resend-verification）

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`（`VerifyEmailDto`）
- Modify: `apps/api/src/auth/auth.controller.ts`（两端点 + 注入 `EmailVerificationService`）

- [ ] **Step 1: DTO**（`auth.service.ts` DTO 区，`ResetPasswordDto` 之后）

```ts
export class VerifyEmailDto {
  @IsString() token: string;
}
```

- [ ] **Step 2: 控制器**

- import 加 `VerifyEmailDto`（从 auth.service）、`import { EmailVerificationService } from './email-verification.service';`
- 构造函数注入第三参 `private emailVerification: EmailVerificationService`。
- 在 `me` 之前加：
```ts
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.emailVerification.verify(dto.token);
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  async resendVerification(@CurrentUser() user: { id: string }) {
    await this.emailVerification.resend(user.id);
    return { ok: true };
  }
```

- [ ] **Step 3: 构建** — `npm run build -w @swim/api` → 成功。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts
git commit -m 'feat(api): /auth/verify-email /auth/resend-verification 端点'
```

---

### Task 6: 后端 e2e

**Files:**
- Create: `apps/api/test/email-verify.e2e-spec.ts`

- [ ] **Step 1: 写 e2e**（`overrideProvider(MailService)` 捕获 verify 链接；beforeAll 清库含 `refreshToken.deleteMany()` 先行）

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Email verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { url?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ sendMail: (o: { text?: string }) => { if (o.text?.includes('/verify-email')) captured.url = o.text; return Promise.resolve(); }, sendPasswordReset: () => Promise.resolve() })
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
  const tokenFrom = (text: string) => new URL(text.match(/https?:\S+/)![0]).searchParams.get('token')!;

  it('注册 → 验证链接 → verify → /auth/me 已验证', async () => {
    captured.url = undefined;
    const reg = await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' }).expect(201);
    expect(captured.url).toContain('/verify-email?token=');
    const token = tokenFrom(captured.url!);

    // 验证前：/auth/me 未验证
    const me0 = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    expect(me0.body.emailVerifiedAt).toBeNull();

    await request(srv()).post('/auth/verify-email').send({ token }).expect(201);

    const me1 = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    expect(me1.body.emailVerifiedAt).toBeTruthy();
  });

  it('无效 token → 400', async () => {
    await request(srv()).post('/auth/verify-email').send({ token: 'bogus' }).expect(400);
  });

  it('认领的游泳者 → 自动已验证', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'owner2@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = (await request(srv()).post('/pools').set(oh).send({ name: 'P' }).expect(201)).body;
    const sw = (await request(srv()).post(`/pools/${pool.id}/swimmers`).set(oh).send({ email: 'sw@x.com', name: 'Sw' }).expect(201)).body;
    const link = (await request(srv()).post(`/pools/${pool.id}/swimmers/${sw.id}/claim-link`).set(oh).expect(201)).body;
    const claimed = (await request(srv()).post('/auth/claim').send({ token: link.claimToken, password: 'password123' }).expect(201)).body;
    const me = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${claimed.accessToken}`).expect(200);
    expect(me.body.emailVerifiedAt).toBeTruthy();
  });
});
```
> 认领链路字段名（`claimToken`、swimmer 创建端点形状）以既有 `swimmer-flows.e2e-spec.ts` 为准；如有出入照该文件对齐。

- [ ] **Step 2: 跑 e2e** — `npm run test:e2e` → 全绿（新文件 + 既有回归）。

- [ ] **Step 3: 提交**

```bash
git add apps/api/test/email-verify.e2e-spec.ts
git commit -m 'test(api): 邮箱验证 e2e（注册发信/验证/认领自动验证）'
```

---

### Task 7: 前端 web（未验证横幅 + 验证页）

**Files:**
- Modify: `apps/web/src/components/AppLayout.tsx`（横幅 + 重发）
- Create: `apps/web/src/features/auth/VerifyEmailPage.tsx`
- Modify: `apps/web/src/lib/api/endpoints.ts` · `apps/web/src/app/router.tsx` · `apps/web/src/test/msw.ts`
- Modify: `apps/web/src/lib/queries.ts`（`useMe` 若存在；否则 AppLayout 直接取 store.user）
- Test: `apps/web/src/components/AppLayout.test.tsx`（加未验证横幅用例）· `apps/web/src/features/auth/VerifyEmailPage.test.tsx`

**Interfaces:**
- Produces: `verifyEmail(token)`、`resendVerification()` endpoints。

- [ ] **Step 1: endpoints**（`endpoints.ts`，`resetPassword` 之后）

```ts
export const verifyEmail = (token: string) =>
  api.post('/auth/verify-email', { token }).then((r) => r.data);
export const resendVerification = () =>
  api.post('/auth/resend-verification').then((r) => r.data);
```

- [ ] **Step 2: msw 默认处理器**（`apps/web/src/test/msw.ts` handlers 加）

```ts
  http.post('/api/auth/verify-email', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/resend-verification', () => HttpResponse.json({ ok: true })),
```

- [ ] **Step 3: AppLayout 横幅失败测试**（`AppLayout.test.tsx` 加）

```ts
it('未验证邮箱时显示横幅与重发', async () => {
  useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'owner@x.com', role: 'OWNER', emailVerifiedAt: null });
  renderWithProviders(<AppLayout />, { route: '/pools' });
  expect(screen.getByText(/请验证你的邮箱/)).toBeInTheDocument();
});
```
> `MeResponse` 已含 `emailVerifiedAt`，`setAuth` 传带该字段的 user。AppLayout 从 `store.user.emailVerifiedAt` 判断（owner 控制台登录后 `getMe()` 已写入 user）。

- [ ] **Step 4: 跑测试确认失败** — `npm test -w @swim/web -- AppLayout` → FAIL。

- [ ] **Step 5: AppLayout 加横幅**（`AppLayout.tsx`）

- import：`import { Alert } from 'antd';`（与既有 antd import 合并）、`import { resendVerification } from '../lib/api/endpoints';`、`App`（用 message）——`import { ..., App } from 'antd';`
- 组件内取 `const user = useAuthStore((s) => s.user);`（已存在）。
- 在 `<Layout.Content>` 之上、`<Layout.Header>` 之下插入：
```tsx
        {user && user.emailVerifiedAt == null && (
          <Alert
            type="warning"
            banner
            message="请验证你的邮箱以保障账号安全。"
            action={
              <a
                onClick={async () => {
                  await resendVerification().catch(() => {});
                  message.success('验证邮件已重发');
                }}
              >
                重发验证邮件
              </a>
            }
          />
        )}
```
（`const { message } = App.useApp();` 加到组件顶部；`App` 已由根 Providers 包裹。）

- [ ] **Step 6: VerifyEmailPage**（`VerifyEmailPage.tsx`，mount 自动验证）

```tsx
import { useEffect, useRef, useState } from 'react';
import { Card, Result, Button, Spin } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../../lib/api/endpoints';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('fail');
      return;
    }
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [token]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card style={{ width: 420 }}>
        {state === 'pending' && <Spin tip="验证中…" />}
        {state === 'ok' && (
          <Result status="success" title="邮箱已验证" extra={<Button type="primary" onClick={() => navigate('/pools')}>进入控制台</Button>} />
        )}
        {state === 'fail' && (
          <Result status="error" title="链接无效或已过期" extra={<Button onClick={() => navigate('/login')}>返回登录</Button>} />
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: VerifyEmailPage 测试** `VerifyEmailPage.test.tsx`

```ts
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { VerifyEmailPage } from './VerifyEmailPage';

describe('VerifyEmailPage', () => {
  it('带 token mount 自动验证成功', async () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email?token=T' });
    await waitFor(() => expect(screen.getByText('邮箱已验证')).toBeInTheDocument());
  });
});
```

- [ ] **Step 8: 路由**（`router.tsx`，`/login` 行之后加公开路由 + import）

```tsx
        <Route path="/verify-email" element={<VerifyEmailPage />} />
```

- [ ] **Step 9: 跑 web 全量单测** — `npm test -w @swim/web` → 全绿。

- [ ] **Step 10: 提交**

```bash
git add apps/web/src
git commit -m 'feat(web): 未验证邮箱横幅 + 重发 + 验证页'
```

---

### Task 8: 终验 + README + 自评审 + 通知

**Files:**
- Modify: `README.md` · `apps/api/.env.example`

- [ ] **Step 1: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 2: 实跑**（本地起 api 无 SMTP）：注册 OWNER → api 日志见 `[DEV MAIL]` 验证链接 → `POST /auth/verify-email {token}` → `GET /auth/me` 的 `emailVerifiedAt` 非空。

- [ ] **Step 3: .env.example** — 在 `PASSWORD_RESET_TTL` 后加 `EMAIL_VERIFY_TTL="24h"`。

- [ ] **Step 4: README** — 鉴权小节补「邮箱验证（软门禁：未验证可登录，控制台横幅 + 重发；认领游泳者自动已验证）」；接口一览加 `POST /auth/verify-email`、`/auth/resend-verification`。

- [ ] **Step 5: 自评审** — 软门禁不拦登录；验证令牌仅哈希；`/auth/me` 实时；认领自动验证；既有 e2e 全过（register 走 dev 邮件不抛）。

- [ ] **Step 6: 提交 + 通知**

```bash
git add README.md apps/api/.env.example
git commit -m 'docs: 邮箱验证（鉴权/接口/.env）'
```
通知用户 #2c 完成 + 全量门禁绿 + 摘要 + 剩 #2d（认领链接自动发信）。

## Self-Review（plan vs spec）

- **Spec coverage**：User 列/迁移(T2) · 服务(T3) · register/claim/me 接线(T4) · 端点(T5) · 配置(T1) · e2e(T6) · 前端横幅+验证页(T7) · README/.env(T8) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；e2e 认领字段「以 swimmer-flows 为准」给出对齐规则（非占位）。
- **Type consistency**：`sendVerification(userId,email,role)`、`verify(token)`、`resend(userId)`、`MeResponse.emailVerifiedAt`、endpoints `verifyEmail(token)`/`resendVerification()` 跨任务一致。
- **偏差（优于 spec）**：`/auth/me` 不另加查询——`jwt.strategy.validate` 本就查库，直接在其返回追加 `emailVerifiedAt`。
- **风险**：AuthService 构造加第四参 → auth.service.spec 全局加 stub（T4）；register 现做邮件 I/O → dev 传输只日志（既有 e2e 不受影响）。
