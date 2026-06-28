# 刷新令牌轮换 + 登出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单 access token 升级为「短寿命 access（15m）+ 旋转 refresh（30d，哈希存库）」，带服务端真撤销与复用检测，两端 axios 401 静默续期。

**Architecture:** 新 `RefreshToken` 表 + 独立 `RefreshTokenService`（issue/rotate/validate/revoke/revokeFamily/revokeAllForUser）；`AuthService.issueSession` 同签 access+refresh；新增 `/auth/refresh`、`/auth/logout`、`/auth/logout-all`。前端 auth-store 增 `refreshToken`+`setTokens`，axios 拦截器单飞续期。

**Tech Stack:** NestJS 10 · Prisma 5（新表+迁移）· node crypto（sha256/randomBytes）· `@swim/shared` 类型 · React/Zustand/axios（两端）。

## Global Constraints

- refresh 为不透明 256-bit 随机串，存库只存 `sha256(明文)`（**不**用 bcrypt）。
- 轮换：每次 `/auth/refresh` 撤旧签新（同 `familyId`）。**复用检测**：presented token 行已 `revokedAt` ⇒ `revokeFamily` + 401。
- access TTL 默认 `1d→15m`；新增 `REFRESH_TOKEN_TTL` 默认 `30d`。
- 前端 auth-store **保留 `token` 字段名**（= access），**新增** `refreshToken` + `setTokens`；`setAuth` 加可选第 3 参 `refreshToken?`，省略时保留既有值。
- 续期调用走**裸 axios**（不经拦截器）防递归；**单飞**共享一次 refresh。
- 不用 httpOnly cookie、不含邮件/密码重置/2FA。
- `LoginResponse` 仅**增** `refreshToken` 字段；既有断言改 `toMatchObject`。
- 现有 120 单测 + 13 e2e 保持全绿；TDD：红→绿→提交，频繁提交。

---

### Task 1: 配置增项（access TTL + refresh TTL）

**Files:**
- Modify: `apps/api/src/common/env.validation.ts`
- Test: `apps/api/src/common/env.validation.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts:18`

**Interfaces:**
- Produces: `validateEnv` 额外校验/回填 `JWT_EXPIRES_IN`（默认 `15m`）、`REFRESH_TOKEN_TTL`（默认 `30d`），二者须匹配 `^\d+(ms|s|m|h|d)$`。

- [ ] **Step 1: 追加失败测试**（`env.validation.spec.ts` 末尾、`describe` 内）

```ts
it('回填 JWT_EXPIRES_IN=15m 与 REFRESH_TOKEN_TTL=30d 默认', () => {
  const out = validateEnv({ ...ok });
  expect(out.JWT_EXPIRES_IN).toBe('15m');
  expect(out.REFRESH_TOKEN_TTL).toBe('30d');
});
it('非法时长字符串抛错', () => {
  expect(() => validateEnv({ ...ok, REFRESH_TOKEN_TTL: '30days' })).toThrow(/REFRESH_TOKEN_TTL/);
  expect(() => validateEnv({ ...ok, JWT_EXPIRES_IN: 'abc' })).toThrow(/JWT_EXPIRES_IN/);
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- env.validation` → FAIL。

- [ ] **Step 3: 扩展 `validateEnv`**：在 `PORT` 校验之后、`return` 之前加：

```ts
  const DURATION_RE = /^\d+(ms|s|m|h|d)$/;
  const jwtExpiresIn = (config.JWT_EXPIRES_IN as string) ?? '15m';
  if (!DURATION_RE.test(jwtExpiresIn)) {
    throw new Error(`JWT_EXPIRES_IN must be a duration like 15m/1d; got "${jwtExpiresIn}".`);
  }
  const refreshTtl = (config.REFRESH_TOKEN_TTL as string) ?? '30d';
  if (!DURATION_RE.test(refreshTtl)) {
    throw new Error(`REFRESH_TOKEN_TTL must be a duration like 30d; got "${refreshTtl}".`);
  }
```
并在 `return { ...config, ... }` 中加 `JWT_EXPIRES_IN: jwtExpiresIn, REFRESH_TOKEN_TTL: refreshTtl,`。

- [ ] **Step 4: auth.module.ts 默认改 15m** — 把 `config.get<string>('JWT_EXPIRES_IN', '1d')` 改为 `config.get<string>('JWT_EXPIRES_IN', '15m')`。

- [ ] **Step 5: 跑测试确认通过** — `npm test -w @swim/api -- env.validation` → PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/common/env.validation.ts apps/api/src/common/env.validation.spec.ts apps/api/src/auth/auth.module.ts
git commit -m 'feat(api): access TTL 默认 15m + REFRESH_TOKEN_TTL 配置'
```

---

### Task 2: `RefreshToken` 模型 + 迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（加 model + User 反向关系）
- Create: `apps/api/prisma/migrations/<ts>_refresh_token/migration.sql`

**Interfaces:**
- Produces: Prisma `refreshToken` delegate（字段 `id,userId,tokenHash@unique,familyId,expiresAt,createdAt,revokedAt,replacedById`）。

- [ ] **Step 1: 加模型**（`schema.prisma`）。在 `User` 模型内 `refreshTokens` 反向关系加一行：`refreshTokens RefreshToken[]`。文件末加：

```prisma
model RefreshToken {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique
  familyId     String
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?
  replacedById String?

  @@index([userId])
  @@index([familyId])
}
```

- [ ] **Step 2: 生成迁移 SQL（非交互）**

Run（在 `apps/api`）：
```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/$(node -e "process.stdout.write(new Date().toISOString().replace(/[-:T]/g,'').slice(0,14))")_refresh_token/migration.sql
```
> 若上句在本 shell 不便，按既有迁移目录命名手建 `prisma/migrations/<14位时间戳>_refresh_token/migration.sql`，内容为 `migrate diff` 输出（CREATE TABLE "RefreshToken" + 索引 + 外键）。

- [ ] **Step 3: 应用迁移 + 重新生成 client**

Run（`apps/api`）：`npx prisma migrate deploy && npx prisma generate`
Expected: 迁移应用、client 含 `refreshToken`。

- [ ] **Step 4: 构建确认类型可见** — `npm run build -w @swim/api` → 成功。

- [ ] **Step 5: 提交**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m 'feat(db): RefreshToken 表（哈希存储 + 家族 + 轮换审计）'
```

---

### Task 3: 时长解析工具

**Files:**
- Create: `apps/api/src/common/duration.ts`
- Test: `apps/api/src/common/duration.spec.ts`

**Interfaces:**
- Produces: `parseDurationMs(input: string): number` —— `'30d'→2592000000`，非法抛错。

- [ ] **Step 1: 失败测试** `duration.spec.ts`

```ts
import { parseDurationMs } from './duration';
describe('parseDurationMs', () => {
  it('解析常见单位', () => {
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('15m')).toBe(900_000);
    expect(parseDurationMs('30d')).toBe(2_592_000_000);
  });
  it('非法 → 抛错', () => {
    expect(() => parseDurationMs('30days')).toThrow();
    expect(() => parseDurationMs('abc')).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- duration` → FAIL。

- [ ] **Step 3: 实现** `duration.ts`

```ts
const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** 解析 "15m"/"30d"/"500ms" 为毫秒。非法即抛错。 */
export function parseDurationMs(input: string): number {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: "${input}"`);
  return Number(m[1]) * UNIT_MS[m[2]];
}
```

- [ ] **Step 4: 跑测试确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/common/duration.ts apps/api/src/common/duration.spec.ts
git commit -m 'feat(api): parseDurationMs 时长解析'
```

---

### Task 4: `RefreshTokenService`

**Files:**
- Create: `apps/api/src/auth/refresh-token.service.ts`
- Test: `apps/api/src/auth/refresh-token.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`、`ConfigService`、`parseDurationMs`。
- Produces:
  - `issue(userId: string, familyId?: string): Promise<string>`（返回明文，存其 hash；无 family 则开新）
  - `rotate(presented: string): Promise<{ token: string; userId: string }>`（复用 ⇒ 撤族 + `UnauthorizedException`）
  - `revoke(presented: string): Promise<void>` · `revokeFamily(familyId: string)` · `revokeAllForUser(userId: string)`

- [ ] **Step 1: 失败测试** `refresh-token.service.spec.ts`

```ts
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

const cfg = { get: () => '30d' } as any;

describe('RefreshTokenService', () => {
  it('issue 落库存 hash（非明文）并返回明文', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { create } };
    const svc = new RefreshTokenService(prisma, cfg);
    const token = await svc.issue('u1');
    expect(typeof token).toBe('string');
    const data = create.mock.calls[0][0].data;
    expect(data.tokenHash).not.toBe(token);
    expect(data.tokenHash).toHaveLength(64); // sha256 hex
    expect(data.userId).toBe('u1');
    expect(data.familyId).toBeTruthy();
  });

  it('rotate：有效 → 撤旧签新（同族），返回新明文+userId', async () => {
    const row = { id: 'r1', userId: 'u1', familyId: 'fam', revokedAt: null, expiresAt: new Date(Date.now() + 1e6) };
    const findUnique = jest.fn()
      .mockResolvedValueOnce(row)               // 查 presented
      .mockResolvedValueOnce({ id: 'r2' });      // 查新 token 行（取 id 作 replacedById）
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { findUnique, create, update } };
    const svc = new RefreshTokenService(prisma, cfg);
    const res = await svc.rotate('plain');
    expect(res.userId).toBe('u1');
    expect(typeof res.token).toBe('string');
    expect(create.mock.calls[0][0].data.familyId).toBe('fam'); // 同族
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ replacedById: 'r2' }) }));
  });

  it('rotate：presented 已撤销 ⇒ 撤族 + Unauthorized（复用检测）', async () => {
    const row = { id: 'r1', userId: 'u1', familyId: 'fam', revokedAt: new Date(), expiresAt: new Date(Date.now() + 1e6) };
    const findUnique = jest.fn().mockResolvedValue(row);
    const updateMany = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { findUnique, updateMany } };
    const svc = new RefreshTokenService(prisma, cfg);
    await expect(svc.rotate('plain')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ familyId: 'fam' }) }));
  });

  it('rotate：查无 → Unauthorized', async () => {
    const prisma: any = { refreshToken: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new RefreshTokenService(prisma, cfg).rotate('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokeAllForUser 撤销该用户全部未撤销', async () => {
    const updateMany = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { updateMany } };
    await new RefreshTokenService(prisma, cfg).revokeAllForUser('u1');
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/api -- refresh-token.service` → FAIL（模块不存在）。

- [ ] **Step 3: 实现** `refresh-token.service.ts`

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class RefreshTokenService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlMs(): number {
    return parseDurationMs(this.config.get<string>('REFRESH_TOKEN_TTL') ?? '30d');
  }

  /** 新明文 refresh（仅存 hash）。无 familyId 则开新家族。 */
  async issue(userId: string, familyId?: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + this.ttlMs()),
      },
    });
    return token;
  }

  /** 校验 + 轮换。复用已撤销 token ⇒ 撤族并抛。 */
  async rotate(presented: string): Promise<{ token: string; userId: string }> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(presented) } });
    if (!row) throw new UnauthorizedException('refresh token 无效');
    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('refresh token 已失效');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('refresh token 已过期');

    const next = await this.issue(row.userId, row.familyId);
    const nextRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(next) } });
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: nextRow?.id ?? null },
    });
    return { token: next, userId: row.userId };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
```

- [ ] **Step 4: 跑测试确认通过** — PASS（5 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/refresh-token.service.ts apps/api/src/auth/refresh-token.service.spec.ts
git commit -m 'feat(api): RefreshTokenService（轮换 + 复用检测 + 撤销）'
```

---

### Task 5: AuthService 双 token + refresh/logout；shared 类型；模块装配

**Files:**
- Modify: `packages/shared/src/index.ts`（`LoginResponse` 加 `refreshToken`）
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`（providers 加 `RefreshTokenService`）

**Interfaces:**
- Consumes: `RefreshTokenService`。
- Produces: `AuthService` 构造签名变为 `(prisma, jwt, refreshTokens)`；`register/login/claim` 返回 `{accessToken, refreshToken}`；新增 `refresh(presented)`、`logout(presented)`、`logoutAll(userId)`。

- [ ] **Step 1: shared 改类型** — `packages/shared/src/index.ts` 把 `export interface LoginResponse { accessToken: string; }` 改为 `export interface LoginResponse { accessToken: string; refreshToken: string; }`，然后 `npm run build -w @swim/shared`。

- [ ] **Step 2: 改 auth.service.spec.ts**（适配新构造 + 返回形状）

- 顶部加：`const mkRefresh = () => ({ issue: jest.fn().mockResolvedValue('refresh.tok'), rotate: jest.fn(), revoke: jest.fn(), revokeAllForUser: jest.fn() }) as any;`
- 所有 `new AuthService(prisma, mkJwt())` → `new AuthService(prisma, mkJwt(), mkRefresh())`；带具名 jwt 的同理加第三参 `mkRefresh()`。
- 三处 `expect(res).toEqual({ accessToken: 'signed.jwt.token' })` → `expect(res).toEqual({ accessToken: 'signed.jwt.token', refreshToken: 'refresh.tok' })`。

- [ ] **Step 3: 跑测试确认失败** — `npm test -w @swim/api -- auth.service` → FAIL（构造参数/返回形状不符）。

- [ ] **Step 4: 改 `auth.service.ts`**

- import 加 `import { RefreshTokenService } from './refresh-token.service';` 与 `import { LoginResponse } from '@swim/shared';`（已部分引入则合并）。
- 构造函数加第三参：
```ts
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private refreshTokens: RefreshTokenService,
  ) {}
```
- 删除 `private sign(...)`，替换为：
```ts
  private async issueSession(user: { id: string; email: string; role: Role }): Promise<LoginResponse> {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = await this.refreshTokens.issue(user.id);
    return { accessToken, refreshToken };
  }

  async refresh(presented: string): Promise<LoginResponse> {
    const { token, userId } = await this.refreshTokens.rotate(presented);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, refreshToken: token };
  }

  async logout(presented: string): Promise<void> {
    await this.refreshTokens.revoke(presented);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }
```
- `register`/`login`/`claim` 末尾的 `return this.sign(user.id, user.email, user.role);` → `return this.issueSession(user);`（`user` 为已创建/查到的用户对象；register/claim 处用其返回的 user，login 处用查到的 user）。

- [ ] **Step 5: 模块装配** — `auth.module.ts` 的 `providers` 加 `RefreshTokenService`（import 之），并确保 `PrismaService` 已在 providers（在）。

- [ ] **Step 6: 跑测试确认通过** — `npm test -w @swim/api -- auth.service` → PASS。

- [ ] **Step 7: 构建** — `npm run build -w @swim/shared && npm run build -w @swim/api` → 成功。

- [ ] **Step 8: 提交**

```bash
git add packages/shared/src/index.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.module.ts
git commit -m 'feat(api): AuthService 签发双 token + refresh/logout/logout-all'
```

---

### Task 6: Auth 端点（refresh / logout / logout-all）

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`（加 `RefreshDto`/`LogoutDto`，或在 controller 内联 DTO）

**Interfaces:**
- Produces: `POST /auth/refresh {refreshToken}`、`POST /auth/logout {refreshToken}`、`POST /auth/logout-all`（JWT 守卫）。

- [ ] **Step 1: DTO**（`auth.service.ts` 顶部 DTO 区加）

```ts
export class RefreshDto {
  @IsString() refreshToken: string;
}
```

- [ ] **Step 2: 控制器加端点**（`auth.controller.ts`）

- import 加 `RefreshDto`（从 auth.service）、`CurrentUser`（已引）。
- 加：
```ts
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: { id: string }) {
    await this.auth.logoutAll(user.id);
    return { ok: true };
  }
```

- [ ] **Step 3: 构建** — `npm run build -w @swim/api` → 成功。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.service.ts
git commit -m 'feat(api): /auth/refresh /auth/logout /auth/logout-all 端点'
```

---

### Task 7: 后端 e2e（轮换 / 复用检测 / 登出）

**Files:**
- Create: `apps/api/test/auth-refresh.e2e-spec.ts`

- [ ] **Step 1: 写 e2e**（app 初始化照搬既有 e2e；beforeAll 清库含 `refreshToken.deleteMany()` 最先，再按 FK 顺序）

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Auth refresh (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it('登录得双 token；轮换后旧 refresh 失效；复用旧 refresh ⇒ 撤族', async () => {
    const reg = await request(srv()).post('/auth/register').send({ email: 'r@x.com', password: 'password123', role: 'OWNER' }).expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.refreshToken).toBeTruthy();
    const rt0 = reg.body.refreshToken;

    // 轮换 → 新双 token
    const ref1 = await request(srv()).post('/auth/refresh').send({ refreshToken: rt0 }).expect(201);
    const rt1 = ref1.body.refreshToken;
    expect(rt1).toBeTruthy();
    expect(rt1).not.toBe(rt0);

    // 旧 refresh 再用 → 401（且触发撤族）
    await request(srv()).post('/auth/refresh').send({ refreshToken: rt0 }).expect(401);

    // 撤族后，刚才的 rt1 也连带失效 → 401
    await request(srv()).post('/auth/refresh').send({ refreshToken: rt1 }).expect(401);
  });

  it('logout 撤销当前 refresh；logout-all 撤销全部', async () => {
    const reg = await request(srv()).post('/auth/register').send({ email: 'r2@x.com', password: 'password123', role: 'OWNER' }).expect(201);
    const { accessToken, refreshToken } = reg.body;
    await request(srv()).post('/auth/logout').send({ refreshToken }).expect(201);
    await request(srv()).post('/auth/refresh').send({ refreshToken }).expect(401);

    // 新登录两个会话，logout-all 后都失效
    const a = (await request(srv()).post('/auth/login').send({ email: 'r2@x.com', password: 'password123' }).expect(201)).body;
    const b = (await request(srv()).post('/auth/login').send({ email: 'r2@x.com', password: 'password123' }).expect(201)).body;
    await request(srv()).post('/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`).expect(201);
    await request(srv()).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await request(srv()).post('/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
  });
});
```

- [ ] **Step 2: 修既有 e2e 清理顺序** — 在 `owner-flows`/`swimmer-flows`/`challenge-flows`/`places-flows` 的 `beforeAll` 首行加 `await prisma.refreshToken.deleteMany();`（register 现在会建 refresh 行，`user.deleteMany()` 受 FK 阻挡）。

- [ ] **Step 3: 跑 e2e** — `npm run test:e2e` → 全绿（新文件 + 既有回归）。既有断言登录响应形状者改 `toMatchObject`。

- [ ] **Step 4: 提交**

```bash
git add apps/api/test
git commit -m 'test(api): 刷新令牌 e2e（轮换/复用检测/登出）+ 清理顺序'
```

---

### Task 8: 前端 auth-store 双 token（web + swimmer）

**Files:**
- Modify: `apps/web/src/lib/auth-store.ts` · `apps/swimmer/src/lib/auth-store.ts`
- Test: `apps/web/src/lib/auth-store.test.ts` · `apps/swimmer/src/lib/auth-store.test.ts`

**Interfaces:**
- Produces: store 增 `refreshToken: string | null`、`setTokens(token, refreshToken)`；`setAuth(token, user, refreshToken?)`（省略保留既有 refresh）；持久化 `token`+`refreshToken`。

- [ ] **Step 1: 追加失败测试**（两端各自 `auth-store.test.ts` 末尾）

```ts
it('setAuth 第三参存 refreshToken；setTokens 同时更新双 token', () => {
  useAuthStore.getState().setAuth('a1', { id: 'o1', email: 'o@x.com', role: 'OWNER' }, 'r1');
  expect(useAuthStore.getState().refreshToken).toBe('r1');
  useAuthStore.getState().setTokens('a2', 'r2');
  expect(useAuthStore.getState().token).toBe('a2');
  expect(useAuthStore.getState().refreshToken).toBe('r2');
  useAuthStore.getState().clear();
  expect(useAuthStore.getState().refreshToken).toBeNull();
});
```
（swimmer 端 role 用 `'SWIMMER'`。）

- [ ] **Step 2: 跑测试确认失败** — `npm test -w @swim/web -- auth-store` → FAIL。

- [ ] **Step 3: 改两端 `auth-store.ts`**（除 `name` 外两端一致）

```ts
interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: MeResponse | null;
  setAuth: (token: string, user: MeResponse, refreshToken?: string) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setUser: (user: MeResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, user, refreshToken) =>
        set((s) => ({ token, user, refreshToken: refreshToken ?? s.refreshToken })),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: 'swim-auth', // swimmer: 'swim-swimmer-auth'
      partialize: (s) => ({ token: s.token, refreshToken: s.refreshToken }),
    },
  ),
);
```

- [ ] **Step 4: 跑测试确认通过** — `npm test -w @swim/web -- auth-store` 与 `-w @swim/swimmer` → PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/auth-store.ts apps/web/src/lib/auth-store.test.ts apps/swimmer/src/lib/auth-store.ts apps/swimmer/src/lib/auth-store.test.ts
git commit -m 'feat(web+swimmer): auth-store 增 refreshToken + setTokens'
```

---

### Task 9: 前端 axios 单飞续期 + login/claim/logout（web + swimmer）

**Files:**
- Modify: `apps/web/src/lib/api/client.ts` · `apps/swimmer/src/lib/api/client.ts`
- Modify: `apps/web/src/lib/api/endpoints.ts` · `apps/swimmer/src/lib/api/endpoints.ts`（加 `logout`）
- Modify: `apps/web/src/features/auth/LoginPage.tsx` · `apps/swimmer/src/features/auth/LoginPage.tsx` · `apps/swimmer/src/features/auth/ClaimPage.tsx`（存 refreshToken）
- Test: `apps/web/src/lib/api/client.test.ts` · `apps/swimmer/src/lib/api/client.test.ts`（加单飞续期用例）

**Interfaces:**
- Consumes: store `refreshToken`/`setTokens`/`clear`。
- Produces: 401 → 单飞 `/auth/refresh` → 重试；`logout(refreshToken)` 端点。

- [ ] **Step 1: 追加失败测试**（两端 `client.test.ts`，按既有 mock 风格）

```ts
it('401 → 单飞调用 /auth/refresh 续期并重试原请求', async () => {
  useAuthStore.getState().setTokens('old', 'r1');
  // 首个受保护请求 401，一次 refresh（返回新双 token），重试成功。
  // 用既有的 axios mock/MSW 机制：/auth/refresh 返回 { accessToken:'new', refreshToken:'r2' }，
  // 受保护端点首次 401、带新 token 重试 200。
  // 断言：refresh 只被调用一次；store.token 更新为 'new'、refreshToken 为 'r2'。
  // （具体桩按本仓 client.test 既有写法落地。）
  expect(true).toBe(true); // 占位——实现时替换为真实断言
});
```
> 注：本步在实现时**按 `client.test.ts` 既有 mock 机制**写出真实断言（拦截 `/auth/refresh` 与受保护端点，断言单次刷新 + 重试 + store 更新），不保留占位。

- [ ] **Step 2: 跑测试确认失败**（写出真实断言后）— `npm test -w @swim/web -- client` → FAIL。

- [ ] **Step 3: 改两端 `client.ts`**（两端一致）

```ts
import axios from 'axios';
import { useAuthStore } from '../auth-store';

let redirectToLogin = () => { window.location.assign('/login'); };
export function setRedirectToLogin(fn: () => void) { redirectToLogin = fn; }

export const api = axios.create({ baseURL: '/api' });
// 裸客户端：仅用于 refresh 调用，避免拦截器递归。
const bare = axios.create({ baseURL: '/api' });

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = useAuthStore.getState().refreshToken;
  if (!rt) return null;
  try {
    const { data } = await bare.post('/auth/refresh', { refreshToken: rt });
    useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    if (status === 401 && original && !original._retry && !String(original.url).includes('/auth/refresh')) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      useAuthStore.getState().clear();
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
```

- [ ] **Step 4: endpoints 加 logout**（两端 `endpoints.ts`）

```ts
export const logout = (refreshToken: string) =>
  api.post('/auth/logout', { refreshToken }).then((r) => r.data);
```

- [ ] **Step 5: login/claim 存 refreshToken**

- web `LoginPage.tsx`：把 `const { accessToken } = ...` 改为 `const { accessToken, refreshToken } = ...`；两处 `setAuth(accessToken, X)` 改为 `setAuth(accessToken, X, refreshToken)`。
- swimmer `LoginPage.tsx`、`ClaimPage.tsx`：同上（`login`/`claim` 解构 `refreshToken`，`setAuth` 传第三参）。

- [ ] **Step 6: logout 调端点**（登出处先撤服务端再清本地）

- 两端登出处理（web `AppLayout` 的登出、swimmer `ProfilePage.logout`）：改为先 `const rt = useAuthStore.getState().refreshToken; if (rt) await logout(rt).catch(() => {});` 再 `clear()`。（`logout` 从 endpoints 引入。）

- [ ] **Step 7: 跑两端单测确认通过** — `npm test -w @swim/web` 与 `-w @swim/swimmer` → PASS。

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/lib apps/web/src/features/auth apps/swimmer/src/lib apps/swimmer/src/features/auth apps/web/src/components apps/swimmer/src/features/profile
git commit -m 'feat(web+swimmer): axios 单飞续期 + login/claim/logout 双 token'
```

---

### Task 10: 终验 + README + 自评审 + 通知

**Files:**
- Modify: `README.md`（鉴权小节：双 token、轮换、登出端点、TTL）

- [ ] **Step 1: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿；逐项修复。

- [ ] **Step 2: 实跑链路**（本地起 api）：register→拿双 token；`curl -X POST /auth/refresh -d '{"refreshToken":"..."}'`→新双 token；重放旧 refresh→401；`/auth/logout`→该 refresh 401。

- [ ] **Step 3: README 鉴权小节更新** —「鉴权」要点改为：access（JWT，15m）+ refresh（不透明、哈希存库、30d 滑动、轮换+复用检测）；接口一览加 `POST /auth/refresh`、`/auth/logout`、`/auth/logout-all`；说明两端静默续期。

- [ ] **Step 4: 自评审** — refresh 不进日志；旧 token 复用确撤族；两端单飞无双刷；既有断言全过；迁移可重放。

- [ ] **Step 5: 提交 + 通知验收**

```bash
git add README.md && git commit -m 'docs: 刷新令牌轮换 + 登出（鉴权小节/接口/TTL）'
```
通知用户 #2a 完成 + 全量门禁绿 + 摘要 + 后续（#2b 邮件+密码重置 …）。

## Self-Review（plan vs spec）

- **Spec coverage**：数据模型(T2) · TTL 配置(T1) · 服务+轮换+复用检测(T4) · AuthService 双 token+refresh/logout(T5) · 端点(T6) · e2e(T7) · 两端 store(T8) · 单飞续期+login/claim/logout(T9) · README(T10) —— 全覆盖。
- **Placeholder scan**：仅 T9 Step1 显式标注「占位需替换为真实断言」并给出落地规则（按既有 client.test mock 机制），非隐性 TODO；其余步骤均含完整代码/命令。
- **Type consistency**：`LoginResponse{accessToken,refreshToken}`、`issue(userId,familyId?)`、`rotate→{token,userId}`、store `setAuth(token,user,refreshToken?)`/`setTokens(token,refreshToken)` 跨任务一致。
- **风险**：register 现建 refresh 行 → 既有 e2e 清库顺序已在 T7 Step2 处理；`LoginResponse` 加字段 → 既有断言改 `toMatchObject`（T5/T7）。
