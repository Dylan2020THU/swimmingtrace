# 认领链接自动发信 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** owner 生成认领链接时，自动把链接邮件发到该游泳者邮箱（尽力而为），同时仍返回链接供手动复制兜底。

**Architecture:** `MailService` 加 `sendClaimLink`；`PoolsService.generateClaimLink` 注入 `MailService` 在返回前 best-effort 发信；`PoolsModule` 导入 `MailModule`；owner 控制台生成成功视图加「已发送」提示。无迁移。

**Tech Stack:** NestJS（MailService/PoolsService）· nodemailer（经 MailService）· React（web antd）。

## Global Constraints

- 发信**尽力而为**：`.catch` 记日志，邮件失败不影响生成；`generateClaimLink` 仍返回 `{ claimToken, claimUrl, expiresAt }`。
- 守卫不变：仍要求 `target.role === 'SWIMMER'` 且 `!target.claimedAt`（账号接管防御原样）。
- dev 传输不真发信；`ClaimLinkResponse` 形状不变。
- 现有 103 单测 / 20 e2e 不回归；TDD：红→绿→提交。

---

### Task 1: `MailService.sendClaimLink`

**Files:**
- Modify: `apps/api/src/mail/mail.service.ts`
- Test: `apps/api/src/mail/mail.service.spec.ts`

**Interfaces:**
- Produces: `MailService.sendClaimLink(to: string, claimUrl: string): Promise<void>`。

- [ ] **Step 1: 追加失败测试**（`mail.service.spec.ts` describe 内）

```ts
it('sendClaimLink 调底层 sendMail 且含 claimUrl', async () => {
  const sendMail = jest.fn().mockResolvedValue({});
  mockCreateTransport.mockReturnValueOnce({ sendMail });
  const svc = new MailService(cfg({}));
  await svc.sendClaimLink('sw@x.com', 'http://swim/claim/TOK');
  const arg = sendMail.mock.calls[0][0];
  expect(arg.to).toBe('sw@x.com');
  expect(arg.text).toContain('http://swim/claim/TOK');
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- mail.service` → FAIL。

- [ ] **Step 3: 实现**（`mail.service.ts`，`sendPasswordReset` 之后加方法）

```ts
  async sendClaimLink(to: string, claimUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: '你被邀请加入 SwimmingTrace 泳池',
      html: `<p>泳池主邀请你加入。点击设置密码并登录（7 天内有效）：</p><p><a href="${claimUrl}">${claimUrl}</a></p>`,
      text: `加入泳池（7 天内有效）：${claimUrl}`,
    });
  }
```

- [ ] **Step 4: 跑测试确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/mail/mail.service.ts apps/api/src/mail/mail.service.spec.ts
git commit -m 'feat(api): MailService.sendClaimLink'
```

---

### Task 2: `PoolsService.generateClaimLink` 发信 + 模块 + e2e

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`（构造注入 + 发信）
- Modify: `apps/api/src/pools/pools.service.spec.ts`
- Modify: `apps/api/src/pools/pools.module.ts`（import `MailModule`）
- Create: `apps/api/test/claim-link-email.e2e-spec.ts`

**Interfaces:**
- Consumes: `MailService.sendClaimLink`。
- Produces: `generateClaimLink` 返回不变，额外 best-effort 发信。

- [ ] **Step 1: 改 pools.service.spec.ts**

- 顶部（import 之后）加：`const mkMail = () => ({ sendClaimLink: jest.fn().mockResolvedValue(undefined), sendMail: jest.fn(), sendPasswordReset: jest.fn() }) as any;`
- 全局替换 `new PoolsService(prisma, { get: () => undefined } as any)` → `new PoolsService(prisma, { get: () => undefined } as any, mkMail())`。
- 「未认领 SWIMMER」测试改为捕获 mail 并断言（**在上一步替换之后**编辑）：把
```ts
    const prisma: any = mk({ id: 's1', role: 'SWIMMER', claimedAt: null });
    const svc = new PoolsService(prisma, { get: () => undefined } as any, mkMail());
    const res = await svc.generateClaimLink('o1', 'p1', 's1');
```
改为
```ts
    const prisma: any = mk({ id: 's1', role: 'SWIMMER', claimedAt: null, email: 'sw@x.com' });
    const mail = mkMail();
    const svc = new PoolsService(prisma, { get: () => undefined } as any, mail);
    const res = await svc.generateClaimLink('o1', 'p1', 's1');
```
并在该测试末尾 `expect(res.claimUrl).toContain(\`/claim/${res.claimToken}\`);` 之后加
```ts
    expect(mail.sendClaimLink).toHaveBeenCalledWith('sw@x.com', res.claimUrl);
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- pools.service` → FAIL（构造参数/断言）。

- [ ] **Step 3: 改 `pools.service.ts`**

- import：`import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';`（加 `Logger`），并 `import { MailService } from '../mail/mail.service';`
- 类内加：`private readonly logger = new Logger(PoolsService.name);`
- 构造函数加第三参：
```ts
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mail: MailService,
  ) {}
```
- `generateClaimLink` 结尾改为：
```ts
    const base = this.config.get<string>('SWIMMER_APP_URL') ?? 'http://localhost:5174';
    const claimUrl = `${base}/claim/${claimToken}`;
    await this.mail
      .sendClaimLink(target.email, claimUrl)
      .catch((e) => this.logger.warn(`认领链接邮件发送失败：${(e as Error).message}`));
    return { claimToken, claimUrl, expiresAt: claimTokenExpiresAt.toISOString() };
```

- [ ] **Step 4: 模块装配** — `pools.module.ts`：`import { MailModule } from '../mail/mail.module';` 并加 `imports: [MailModule]`。

- [ ] **Step 5: 跑测试确认通过** — `npm test -w @swim/api -- pools.service` → PASS。

- [ ] **Step 6: e2e**（`claim-link-email.e2e-spec.ts`，override MailService 捕获）

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Claim link email (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { to?: string; url?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendClaimLink: (to: string, url: string) => { captured.to = to; captured.url = url; return Promise.resolve(); },
        sendMail: () => Promise.resolve(),
        sendPasswordReset: () => Promise.resolve(),
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

  it('生成认领链接 → 返回链接且发信到该游泳者邮箱', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = (await request(srv()).post('/pools').set(oh).send({ name: 'P' }).expect(201)).body;
    const sw = (await request(srv()).post(`/pools/${pool.id}/swimmers`).set(oh).send({ email: 'sw@x.com', name: 'Sw' }).expect(201)).body;
    const link = (await request(srv()).post(`/pools/${pool.id}/swimmers/${sw.swimmerId}/claim-link`).set(oh).expect(201)).body;
    expect(link.claimUrl).toContain('/claim/');
    expect(captured.to).toBe('sw@x.com');
    expect(captured.url).toBe(link.claimUrl);
  });
});
```

- [ ] **Step 7: 跑 e2e** — `npm run test:e2e` → 全绿（新文件 + 既有回归）。

- [ ] **Step 8: 提交**

```bash
git add apps/api/src/pools apps/api/test/claim-link-email.e2e-spec.ts
git commit -m 'feat(api): 生成认领链接时自动发信（尽力而为）'
```

---

### Task 3: 前端「已发送」+ 终验 + README + 通知

**Files:**
- Modify: `apps/web/src/features/swimmers/ClaimLinkButton.tsx`
- Test: `apps/web/src/features/swimmers/ClaimLinkButton.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: ClaimLinkButton 加「已发送」行**（`ClaimLinkButton.tsx` 的 Modal 内 `Typography.Text` 之后加一行）

```tsx
          <Typography.Text type="success">已发送邮件至该游泳者邮箱。</Typography.Text>
```
（置于现有「把链接发给游泳者…」`Typography.Text` 与 `Space.Compact` 之间。）

- [ ] **Step 2: 前端测试断言**（`ClaimLinkButton.test.tsx`：生成后断言出现「已发送」文案）

按该测试既有写法（点击「生成认领链接」→ 等待 Modal）追加：`expect(await screen.findByText(/已发送邮件至该游泳者邮箱/)).toBeInTheDocument();`。若该测试当前不打开 Modal，则补一条最小用例：渲染 → 点击生成 → `findByText(/已发送/)`。

- [ ] **Step 3: 跑 web 测试** — `npm test -w @swim/web -- ClaimLinkButton` → PASS。

- [ ] **Step 4: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 5: README** — 把「游泳者端与账号认领」小节里「owner 在控制台名册点『生成认领链接』→ 拿到 … 手动分发（微信/短信等）」改述为「生成认领链接时**自动发邮件**至该游泳者邮箱（仍返回链接供手动复制兜底）」。

- [ ] **Step 6: 实跑**（本地起 api 无 SMTP）：owner 生成认领链接 → api 日志出现认领邮件（`[DEV MAIL]` 含 `/claim/`）；返回体含 `claimUrl`。

- [ ] **Step 7: 提交 + 通知**

```bash
git add apps/web/src/features/swimmers README.md
git commit -m 'feat(web)+docs: 认领链接「已发送」提示 + README'
```
通知用户 #2d 完成 + **#2（认证生命周期）整片完成** + 全量门禁绿 + 摘要。

## Self-Review（plan vs spec）

- **Spec coverage**：MailService.sendClaimLink(T1) · PoolsService 发信 + 模块(T2) · e2e(T2) · 前端「已发送」(T3) · README(T3) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；前端测试「按既有写法」给出最小用例兜底（非占位）。
- **Type consistency**：`sendClaimLink(to, claimUrl)`、`generateClaimLink` 返回 `{ claimToken, claimUrl, expiresAt }` 跨任务一致；pools.service.spec 替换顺序（先全局替换、再编辑「未认领」测试）已在 T2 Step1 明确，避免前缀重复替换。
- **风险**：register 现发验证邮件 → e2e override 提供 `sendMail` 兜底（T2 Step6）；pools.service.spec 多处实例化 → 全局替换 + 单点捕获。
