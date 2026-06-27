# 游泳者自助 + 账号认领（Phase 2-A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 owner 生成一次性认领链接、游泳者认领设密码后通过新建的 `apps/swimmer` 移动端自助登录、选所属泳池录入游泳、查看个人看板。

**Architecture:** 扩展 `apps/api`（认领端点 + my-pools + 自录泳池归属校验，并正式启用 Phase 2 预留的 SWIMMER 端点）；`apps/web` 小改（owner 生成认领链接 UI）；新建 `apps/swimmer`（移动优先 React+Vite+antd-mobile SPA，复用 `@swim/shared` 与 Phase 1 前端模式）。

**Tech Stack:** NestJS 10 · Prisma 5 · PostgreSQL/PostGIS · bcrypt · class-validator · @nestjs/throttler · React 18 · Vite 5 · antd-mobile · TanStack Query · Zustand · React Router 6 · Vitest/RTL/MSW · Jest/supertest。

## Global Constraints

- 设计见 `docs/superpowers/specs/2026-06-27-swimmer-self-service-claim-design.md`。
- 不引入邮件/短信、不做游泳者自助注册/加入泳池/改资料、不引入 refresh token、不上 Playwright。
- 认领令牌：32 字节 URL-safe、明文存 `User.claimToken`、7 天过期、一次性；认领成功清令牌并写 `passwordHash`(bcrypt 12)+`claimedAt`。
- 所有"过 HTTP 的类型"来自 `@swim/shared`。新 SWIMMER 端点 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(SWIMMER)`；公开认领端点 `@Throttle`。
- 自录带 `poolId` 时必须校验本人在该池 `ACTIVE` 登记，否则 403。
- 错误码：令牌无效→404、过期→410、已认领→409、自录非本人池→403、DTO→400。
- 频繁提交：每个 Task 末尾提交一次。每个后端 Task 跑 `npm run test -w @swim/api` + `npm run build -w @swim/api`；前端跑对应 `test`/`build`。

---

### Task 1: 数据模型 `User.claimToken` / `claimTokenExpiresAt` + 迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（`model User`）
- Create: `apps/api/prisma/migrations/<ts>_add_user_claim_token/migration.sql`

- [ ] **Step 1:** 在 `model User` 内（`claimedAt` 之后）加：
```prisma
  claimToken          String?   @unique
  claimTokenExpiresAt DateTime?
```
- [ ] **Step 2:** 生成迁移 SQL（非交互）：
```bash
cd apps/api && TS=$(date +%Y%m%d%H%M%S) && mkdir -p "prisma/migrations/${TS}_add_user_claim_token"
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > "prisma/migrations/${TS}_add_user_claim_token/migration.sql"
```
> 注：`--from-schema-datasource` 取当前库状态（已迁到 init），`--to-schema-datamodel` 取新 schema，差异即新增两列 + 唯一索引。
- [ ] **Step 3:** 应用并重生成 client：`npm run prisma:deploy -w @swim/api && npm run prisma:generate -w @swim/api`。Expected：迁移应用成功，client 类型含 `claimToken`/`claimTokenExpiresAt`。
- [ ] **Step 4:** Commit：`git add apps/api/prisma && git commit -m "feat(db): User.claimToken/claimTokenExpiresAt 认领令牌"`

---

### Task 2: `@swim/shared` 认领与 my-pools 类型

**Files:** Modify `packages/shared/src/index.ts`

**Interfaces — Produces:** `ClaimLinkResponse`、`ClaimInfoResponse`、`ClaimAccountDto`、`MyPoolItem`、`SwimSessionItem`。

- [ ] **Step 1:** 追加：
```ts
// claim（owner 侧生成）
export interface ClaimLinkResponse { claimToken: string; claimUrl: string; expiresAt: string; }
// claim（游泳者侧）
export interface ClaimInfoResponse { name: string | null; email: string; }
export interface ClaimAccountDto { token: string; password: string; }
// my pools
export interface MyPoolItem { id: string; name: string; }
// 自录历史（GET /sessions/me 单项）
export interface SwimSessionItem {
  id: string; poolId: string | null; distanceMeters: number;
  durationSeconds: number | null; swamAt: string;
}
```
- [ ] **Step 2:** `npm run typecheck -w @swim/shared && npm run build -w @swim/shared` → 通过。
- [ ] **Step 3:** Commit：`feat(shared): 认领与 my-pools 类型`

---

### Task 3: owner 生成认领链接 `POST /pools/:id/swimmers/:sid/claim-link`（TDD）

**Files:** Modify `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`；Test `pools.service.spec.ts`。

**Interfaces — Produces:** `PoolsService.generateClaimLink(ownerId, poolId, swimmerId): Promise<ClaimLinkResponse>`；路由 `POST /pools/:id/swimmers/:sid/claim-link` `@Roles(OWNER)`。
**Consumes:** `assertOwnsPool`、`randomBytes`、`ClaimLinkResponse`。

- [ ] **Step 1（失败测试）** 追加到 `pools.service.spec.ts`：
```ts
describe('PoolsService.generateClaimLink', () => {
  it('校验本池登记后写入随机令牌+7天过期，返回 claimUrl', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const svc = new PoolsService(prisma);
    const res = await svc.generateClaimLink('o1', 'p1', 's1');
    const upd = prisma.user.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 's1' });
    expect(typeof upd.data.claimToken).toBe('string');
    expect(upd.data.claimToken.length).toBeGreaterThanOrEqual(32);
    expect(upd.data.claimTokenExpiresAt).toBeInstanceOf(Date);
    expect(res.claimToken).toBe(upd.data.claimToken);
    expect(res.claimUrl).toContain(`/claim/${res.claimToken}`);
  });
  it('游泳者未登记本池 → NotFoundException', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { update: jest.fn() },
    };
    const svc = new PoolsService(prisma);
    await expect(svc.generateClaimLink('o1', 'p1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```
- [ ] **Step 2:** `npm run test -w @swim/api -- pools.service` → FAIL（`generateClaimLink is not a function`）。
- [ ] **Step 3（实现）** `pools.service.ts`：import 补 `ClaimLinkResponse`（`@swim/shared`）。类内：
```ts
  async generateClaimLink(ownerId: string, poolId: string, swimmerId: string): Promise<ClaimLinkResponse> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const reg = await this.prisma.registration.findUnique({
      where: { swimmerId_poolId: { swimmerId, poolId } },
    });
    if (!reg) throw new NotFoundException('该游泳者未登记在本泳池');
    const claimToken = randomBytes(32).toString('hex');
    const claimTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.user.update({ where: { id: swimmerId }, data: { claimToken, claimTokenExpiresAt } });
    const base = process.env.SWIMMER_APP_URL ?? 'http://localhost:5174';
    return { claimToken, claimUrl: `${base}/claim/${claimToken}`, expiresAt: claimTokenExpiresAt.toISOString() };
  }
```
- [ ] **Step 4（路由）** `pools.controller.ts` 类内加：
```ts
  @Post(':id/swimmers/:sid/claim-link')
  @Roles(Role.OWNER)
  claimLink(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string) {
    return this.pools.generateClaimLink(user.id, id, sid);
  }
```
- [ ] **Step 5:** `npm run test -w @swim/api -- pools.service && npm run build -w @swim/api` → PASS。
- [ ] **Step 6:** Commit：`feat(api): owner 生成游泳者认领链接`

---

### Task 4: 认领端点 `GET /auth/claim/:token` + `POST /auth/claim`（TDD）

**Files:** Modify `apps/api/src/auth/auth.service.ts`、`auth.controller.ts`；Test `auth.service.spec.ts`。

**Interfaces — Produces:** `AuthService.getClaimInfo(token): Promise<ClaimInfoResponse>`；`AuthService.claim(dto: ClaimAccountDto): Promise<LoginResponse>`；公开路由 `GET /auth/claim/:token`、`POST /auth/claim`（均 `@Throttle({ default:{ limit:10, ttl:60000 }})`）。
**Consumes:** prisma、jwt、bcrypt、`ClaimInfoResponse`/`ClaimAccountDto`/`LoginResponse`。

错误：令牌不存在→`NotFoundException`(404)；过期→`GoneException`(410)；已认领(`claimedAt!=null`)→`ConflictException`(409)。

- [ ] **Step 1（失败测试）** 追加到 `auth.service.spec.ts`：
```ts
import { GoneException, NotFoundException } from '@nestjs/common';

describe('AuthService.getClaimInfo', () => {
  const future = new Date(Date.now() + 1e6);
  it('有效令牌 → 返回 name/email', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ name: 'Sam', email: 's@x.c', claimedAt: null, claimTokenExpiresAt: future }) } };
    const svc = new AuthService(prisma, mkJwt());
    await expect(svc.getClaimInfo('tok')).resolves.toEqual({ name: 'Sam', email: 's@x.c' });
  });
  it('令牌不存在 → NotFound', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('x')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('过期 → Gone', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ email: 's@x.c', claimedAt: null, claimTokenExpiresAt: new Date(Date.now() - 1000) }) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('tok')).rejects.toBeInstanceOf(GoneException);
  });
  it('已认领 → Conflict', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ email: 's@x.c', claimedAt: new Date(), claimTokenExpiresAt: future }) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('tok')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.claim', () => {
  const future = new Date(Date.now() + 1e6);
  it('有效 → 写 pw/claimedAt、清令牌、签发 token', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 's@x.c', role: 'SWIMMER', claimedAt: null, claimTokenExpiresAt: future }), update } };
    const jwt = mkJwt();
    const res = await new AuthService(prisma, jwt).claim({ token: 'tok', password: 'password123' });
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({ passwordHash: 'HASHED', claimToken: null, claimTokenExpiresAt: null });
    expect(data.claimedAt).toBeInstanceOf(Date);
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 's@x.c', role: 'SWIMMER' });
    expect(res).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
```
> `auth.service.spec.ts` 顶部已 `jest.mock('bcrypt', ... hash: mockResolvedValue('HASHED'))` 与 `mkJwt`/`ConflictException` import（Task 复用 Phase 1 既有）；如缺 `GoneException`/`NotFoundException` import 则补。
- [ ] **Step 2:** `npm run test -w @swim/api -- auth.service` → FAIL。
- [ ] **Step 3（实现）** `auth.service.ts`：import 补 `GoneException, NotFoundException`（`@nestjs/common`）、`ClaimInfoResponse, ClaimAccountDto`（`@swim/shared`）、class-validator `MinLength`（已用）。加 DTO + 方法：
```ts
export class ClaimDto implements ClaimAccountDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

  private async findClaimable(token: string) {
    const user = await this.prisma.user.findUnique({ where: { claimToken: token } });
    if (!user) throw new NotFoundException('认领链接无效');
    if (user.claimedAt) throw new ConflictException('该账号已被认领');
    if (!user.claimTokenExpiresAt || user.claimTokenExpiresAt.getTime() < Date.now()) {
      throw new GoneException('认领链接已过期');
    }
    return user;
  }

  async getClaimInfo(token: string): Promise<ClaimInfoResponse> {
    const user = await this.findClaimable(token);
    return { name: user.name, email: user.email };
  }

  async claim(dto: ClaimAccountDto): Promise<LoginResponse> {
    const user = await this.findClaimable(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, claimedAt: new Date(), claimToken: null, claimTokenExpiresAt: null },
    });
    return this.sign(user.id, user.email, user.role);
  }
```
> `sign` 为 Phase 1 既有 private 方法。`LoginResponse` 已在 `@swim/shared`，按需补 import。
- [ ] **Step 4（路由）** `auth.controller.ts`：import 补 `Param`、`Throttle`（已有）、`ClaimDto`。加：
```ts
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('claim/:token')
  claimInfo(@Param('token') token: string) {
    return this.auth.getClaimInfo(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('claim')
  claim(@Body() dto: ClaimDto) {
    return this.auth.claim(dto);
  }
```
- [ ] **Step 5:** `npm run test -w @swim/api -- auth.service && npm run build -w @swim/api` → PASS。
- [ ] **Step 6:** Commit：`feat(api): 游泳者认领端点（校验/设密码/自动登录）`

---

### Task 5: `GET /me/pools`（TDD）

**Files:** Create `apps/api/src/me/me.controller.ts`、`me.service.ts`、`me.module.ts`、`me.service.spec.ts`；Modify `app.module.ts`（imports 加 `MeModule`）。

**Interfaces — Produces:** `MeService.myPools(swimmerId): Promise<MyPoolItem[]>`；路由 `GET /me/pools` `@Roles(SWIMMER)`。

- [ ] **Step 1（失败测试）** `me.service.spec.ts`：
```ts
import { MeService } from './me.service';
describe('MeService.myPools', () => {
  it('返回本人 ACTIVE 登记的泳池 {id,name}', async () => {
    const prisma: any = { registration: { findMany: jest.fn().mockResolvedValue([
      { pool: { id: 'p1', name: 'A' } }, { pool: { id: 'p2', name: 'B' } },
    ]) } };
    const svc = new MeService(prisma);
    const res = await svc.myPools('s1');
    expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { swimmerId: 's1', status: 'ACTIVE' },
    }));
    expect(res).toEqual([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]);
  });
});
```
- [ ] **Step 2:** `npm run test -w @swim/api -- me.service` → FAIL。
- [ ] **Step 3（实现）** `me.service.ts`：
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MyPoolItem } from '@swim/shared';

@Injectable()
export class MeService {
  constructor(private prisma: PrismaService) {}
  async myPools(swimmerId: string): Promise<MyPoolItem[]> {
    const regs = await this.prisma.registration.findMany({
      where: { swimmerId, status: 'ACTIVE' },
      include: { pool: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    return regs.map((r) => ({ id: r.pool.id, name: r.pool.name }));
  }
}
```
`me.controller.ts`：
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MeService } from './me.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private me: MeService) {}
  @Get('pools')
  @Roles(Role.SWIMMER)
  pools(@CurrentUser() user: { id: string }) {
    return this.me.myPools(user.id);
  }
}
```
`me.module.ts`：
```ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
@Module({ controllers: [MeController], providers: [MeService, PrismaService] })
export class MeModule {}
```
`app.module.ts`：imports 加 `MeModule`。
- [ ] **Step 4:** `npm run test -w @swim/api -- me.service && npm run build -w @swim/api` → PASS。
- [ ] **Step 5:** Commit：`feat(api): GET /me/pools 我的泳池`

---

### Task 6: 启用并加固 `POST /sessions`（泳池归属校验）+ `GET /sessions/me`（TDD）

**Files:** Modify `apps/api/src/sessions/sessions.service.ts`；Create `sessions.service.spec.ts`。

**Interfaces — Produces:** `SessionsService.create(swimmerId, dto)`（带 poolId 时校验 ACTIVE 登记，否则 `ForbiddenException`）；`listForSwimmer` 返回形状对齐 `SwimSessionItem`（字段子集，Prisma 默认返回含这些列）。

- [ ] **Step 1（失败测试）** `sessions.service.spec.ts`：
```ts
import { ForbiddenException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
describe('SessionsService.create', () => {
  it('带 poolId 且本人 ACTIVE 登记 → 创建', async () => {
    const prisma: any = {
      registration: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) },
    };
    await new SessionsService(prisma).create('s1', { distanceMeters: 800, swamAt: '2026-02-01T08:00:00.000Z', poolId: 'p1' });
    expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { swimmerId_poolId: { swimmerId: 's1', poolId: 'p1' } } });
    expect(prisma.swimSession.create).toHaveBeenCalled();
  });
  it('带 poolId 但非本人 ACTIVE 登记 → Forbidden，不创建', async () => {
    const prisma: any = { registration: { findUnique: jest.fn().mockResolvedValue(null) }, swimSession: { create: jest.fn() } };
    await expect(new SessionsService(prisma).create('s1', { distanceMeters: 800, swamAt: '2026-02-01T08:00:00.000Z', poolId: 'p1' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.swimSession.create).not.toHaveBeenCalled();
  });
  it('不带 poolId → 直接创建', async () => {
    const prisma: any = { swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) } };
    await new SessionsService(prisma).create('s1', { distanceMeters: 800, swamAt: '2026-02-01T08:00:00.000Z' });
    expect(prisma.swimSession.create).toHaveBeenCalled();
  });
});
```
- [ ] **Step 2:** `npm run test -w @swim/api -- sessions.service` → FAIL。
- [ ] **Step 3（实现）** `sessions.service.ts`：import 补 `ForbiddenException`，`create` 改为：
```ts
  async create(swimmerId: string, dto: CreateSessionDto) {
    if (dto.poolId) {
      const reg = await this.prisma.registration.findUnique({
        where: { swimmerId_poolId: { swimmerId, poolId: dto.poolId } },
      });
      if (!reg || reg.status !== 'ACTIVE') throw new ForbiddenException('你未在该泳池有效登记');
    }
    return this.prisma.swimSession.create({
      data: { swimmerId, poolId: dto.poolId, distanceMeters: dto.distanceMeters, durationSeconds: dto.durationSeconds, swamAt: new Date(dto.swamAt) },
    });
  }
```
- [ ] **Step 4:** `npm run test -w @swim/api -- sessions.service && npm run build -w @swim/api` → PASS。
- [ ] **Step 5:** Commit：`feat(api): 启用并加固游泳者自录（泳池归属校验）`

---

### Task 7: 后端 e2e — 认领→自录→入 owner 看板

**Files:** Create `apps/api/test/swimmer-flows.e2e-spec.ts`。

- [ ] **Step 1（测试）** 写完整链路（结构同 `owner-flows.e2e-spec.ts`，复用其 app/prisma 启动）：
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Swimmer claim & self-record (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.swimSession.deleteMany(); await prisma.registration.deleteMany();
    await prisma.pool.deleteMany(); await prisma.user.deleteMany();
  });
  afterAll(async () => { await app.close(); });

  it('owner 建游泳者→生成认领链接→认领→自录→入 owner 单泳池看板', async () => {
    const owner = (await request(app.getHttpServer()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const pool = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'P' }).expect(201);
    const sw = await request(app.getHttpServer()).post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`).send({ name: 'Sam', email: 'sam@x.com' }).expect(201);
    const link = await request(app.getHttpServer()).post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`).set('Authorization', `Bearer ${owner}`).expect(201);
    const token = link.body.claimToken;
    const info = await request(app.getHttpServer()).get(`/auth/claim/${token}`).expect(200);
    expect(info.body.email).toBe('sam@x.com');
    const claimed = await request(app.getHttpServer()).post('/auth/claim').send({ token, password: 'swimmerpw1' }).expect(201);
    const swToken = claimed.body.accessToken;
    const myPools = await request(app.getHttpServer()).get('/me/pools').set('Authorization', `Bearer ${swToken}`).expect(200);
    expect(myPools.body).toEqual([{ id: pool.body.id, name: 'P' }]);
    const day = `${new Date().getUTCFullYear()}-03-01`;
    await request(app.getHttpServer()).post('/sessions').set('Authorization', `Bearer ${swToken}`).send({ distanceMeters: 1500, swamAt: `${day}T08:00:00.000Z`, poolId: pool.body.id }).expect(201);
    const ps = await request(app.getHttpServer()).get(`/stats/pool/${pool.body.id}`).set('Authorization', `Bearer ${owner}`).expect(200);
    expect(ps.body.heatmap).toContainEqual({ date: day, distanceMeters: 1500 });
  });

  it('坏令牌→404；已认领再认领→409；非成员池自录→403', async () => {
    await request(app.getHttpServer()).get('/auth/claim/nope').expect(404);
    const owner = (await request(app.getHttpServer()).post('/auth/register').send({ email: 'o2@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const pool = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'Q' }).expect(201);
    const sw = await request(app.getHttpServer()).post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`).send({ email: 'bob@x.com' }).expect(201);
    const token = (await request(app.getHttpServer()).post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`).set('Authorization', `Bearer ${owner}`).expect(201)).body.claimToken;
    const swToken = (await request(app.getHttpServer()).post('/auth/claim').send({ token, password: 'bobpw1234' }).expect(201)).body.accessToken;
    await request(app.getHttpServer()).post('/auth/claim').send({ token, password: 'again1234' }).expect(409);
    await request(app.getHttpServer()).post('/sessions').set('Authorization', `Bearer ${swToken}`).send({ distanceMeters: 100, swamAt: `${new Date().getUTCFullYear()}-03-02T08:00:00.000Z`, poolId: '00000000-0000-0000-0000-000000000000' }).expect(403);
  });
});
```
- [ ] **Step 2:** `npm run test:e2e -w @swim/api` → PASS（2 用例）。
- [ ] **Step 3:** Commit：`test(api): 游泳者认领与自录 e2e`

---

### Task 8: owner 控制台「生成认领链接」UI（apps/web，TDD）

**Files:** Modify `apps/web/src/lib/api/endpoints.ts`、`lib/queries.ts`、`features/swimmers/SwimmerDetailPage.tsx`；Create `features/swimmers/ClaimLinkButton.tsx`、`ClaimLinkButton.test.tsx`。

**Interfaces — Produces:** `generateClaimLink(poolId, sid)` 端点、`useGenerateClaimLink(poolId, sid)` mutation、`<ClaimLinkButton poolId sid claimed>`（弹窗显示 claimUrl + 复制）。

- [ ] **Step 1:** `endpoints.ts` 加：
```ts
import type { ClaimLinkResponse } from '@swim/shared';
export const generateClaimLink = (poolId: string, sid: string) =>
  api.post<ClaimLinkResponse>(`/pools/${poolId}/swimmers/${sid}/claim-link`).then((r) => r.data);
```
`queries.ts` 加：
```ts
export function useGenerateClaimLink(poolId: string, sid: string) {
  return useMutation({ mutationFn: () => ep.generateClaimLink(poolId, sid) });
}
```
- [ ] **Step 2（失败测试）** `ClaimLinkButton.test.tsx`：点击按钮→调用接口→弹窗显示返回的 claimUrl。
```tsx
import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ClaimLinkButton } from './ClaimLinkButton';

it('生成认领链接并展示 URL', async () => {
  server.use(http.post('/api/pools/p1/swimmers/s1/claim-link', () =>
    HttpResponse.json({ claimToken: 'tok', claimUrl: 'http://localhost:5174/claim/tok', expiresAt: '2026-07-04T00:00:00.000Z' })));
  renderWithProviders(<ClaimLinkButton poolId="p1" sid="s1" claimed={false} />);
  await userEvent.click(screen.getByRole('button', { name: /生成认领链接/ }));
  await waitFor(() => expect(screen.getByDisplayValue('http://localhost:5174/claim/tok')).toBeInTheDocument());
});
```
- [ ] **Step 3:** `npm run test -w @swim/web -- ClaimLinkButton` → FAIL。
- [ ] **Step 4（实现）** `ClaimLinkButton.tsx`：按钮（claimed 时禁用显示"已认领"）→ mutateAsync → Modal 内只读 Input 展示 claimUrl + 复制按钮（`navigator.clipboard.writeText`）+ 过期时间。集成进 `SwimmerDetailPage` 头部。
- [ ] **Step 5:** `npm run test -w @swim/web -- ClaimLinkButton && npm run build -w @swim/web` → PASS。
- [ ] **Step 6:** Commit：`feat(web): owner 生成游泳者认领链接 UI`

---

### Task 9: `apps/swimmer` 脚手架 + 测试工具链 + 根脚本/CI 纳入

**Files:** Create `apps/swimmer/{package.json,index.html,vite.config.ts,tsconfig.json,tsconfig.node.json}`、`src/{main.tsx,App.tsx,setupTests.ts,test/msw.ts,test/render.tsx,smoke.test.tsx}`；Modify 根 `package.json`、`.github/workflows/ci.yml`。

- [ ] **Step 1:** `apps/swimmer/package.json`（`@swim/swimmer`，deps：react/react-dom/react-router-dom/@tanstack/react-query/zustand/axios/dayjs/antd-mobile/@uiw/react-heat-map/@swim/shared；devDeps 同 `apps/web`：vite/vitest/@vitejs/plugin-react/jsdom/msw/@testing-library*/typescript/@types*；scripts：dev(`vite`,端口 5174)/build(`tsc -b && vite build`)/preview/test(`vitest run`)/test:watch/lint(`eslint "src/**/*.{ts,tsx}"`)）。
- [ ] **Step 2:** `vite.config.ts`（react 插件 + server.port 5174 + proxy `/api`→`:3000` strip `/api` + vitest jsdom/setupFiles/css:false），`tsconfig.json`（同 web，`paths` 暂可省略——shared 由 node_modules dist 解析；含 `types:["vitest/globals","@testing-library/jest-dom"]`），`tsconfig.node.json`。
- [ ] **Step 3:** `index.html`（lang zh，title「Swim 游泳者」，`viewport` 含 `maximum-scale=1`），`main.tsx`（挂载 App + `import 'antd-mobile/es/global'` 若需），`App.tsx` 占位 `<div>Swim 游泳者</div>`。
- [ ] **Step 4:** `test/msw.ts`（默认 handlers：`/api/auth/me`→SWIMMER user、`/api/me/pools`→[]、`/api/stats/summary`、`/api/stats/heatmap`→[]、`/api/sessions/me`→[]）、`setupTests.ts`（jest-dom + server 生命周期）、`test/render.tsx`（QueryClient + MemoryRouter，retry:false）、`smoke.test.tsx`（渲染标题）。
- [ ] **Step 5:** 根 `package.json`：`dev` 加 `npm:dev:swimmer`、加 `"dev:swimmer": "npm run dev -w @swim/swimmer"`；`build`/`test`/`lint` 追加 `-w @swim/swimmer`。
- [ ] **Step 6:** `ci.yml` 无需改（`npm run build`/`test`/`lint` 已聚合三端）；确认 CORS 文档提示把 5174 加入白名单（仅注释）。
- [ ] **Step 7:** `npm install`（装 antd-mobile 等）→ `npm test -w @swim/swimmer`（smoke PASS）→ `npm run build -w @swim/swimmer`（PASS）。
- [ ] **Step 8:** Commit：`feat(swimmer): 脚手架 + Vitest/RTL/MSW + 根脚本纳入`

---

### Task 10: swimmer 数据层（auth store + axios + endpoints + queries）（TDD）

**Files:** Create `apps/swimmer/src/lib/auth-store.ts`(+test)、`lib/api/client.ts`(+test)、`lib/api/endpoints.ts`、`lib/queries.ts`(+test)。

镜像 `apps/web` 同名文件；差异：auth store persist key `swim-swimmer-auth`；endpoints 覆盖游泳者所需：`login`、`getMe`、`getClaimInfo(token)`、`claim(body)`、`getMyPools()`、`recordMySession(body: CreateSessionDto)`(`POST /sessions`)、`getMySessions()`(`GET /sessions/me`→`SwimSessionItem[]`)、`getMySummary()`(`GET /stats/summary`)、`getMyHeatmap(year?)`(`GET /stats/heatmap`)。

- [ ] **Step 1-2:** auth-store + client 测试与实现（复制 web 版改 persist key）。
- [ ] **Step 3:** endpoints.ts（强类型，用上述 `@swim/shared` 类型）。
- [ ] **Step 4:** queries.ts：`queryKeys`(myPools/mySummary/myHeatmap/mySessions)、hooks `useMyPools/useMySummary/useMyHeatmap/useMySessions`、mutation `useRecordSession`（成功失效 summary/heatmap/sessions）；queries.test 覆盖 `useMyPools`。
- [ ] **Step 5:** `npm test -w @swim/swimmer` → PASS。
- [ ] **Step 6:** Commit：`feat(swimmer): 数据层（auth/axios/endpoints/queries）`

---

### Task 11: swimmer Providers + ProtectedRoute + 路由 + 外壳（TDD）

**Files:** Create `src/components/ProtectedRoute.tsx`(+test)、`src/app/providers.tsx`、`src/app/router.tsx`、`src/components/AppShell.tsx`(底部 TabBar)；Modify `App.tsx`。

- [ ] **Step 1（ProtectedRoute 测试）** 无 token→`/login`；有 token 非 SWIMMER→提示；SWIMMER→渲染 Outlet（3 用例，结构同 web）。
- [ ] **Step 2-4:** ProtectedRoute（`role!=='SWIMMER'`→antd-mobile `ErrorBlock`/提示用 owner 控制台）、providers（QueryClient + 启动 getMe）、router（`/claim/:token`、`/login` 公开；`/`、`/record`、`/history` 受 `ProtectedRoute`+`AppShell`）、AppShell（antd-mobile `TabBar`：看板/历史/我的）。
- [ ] **Step 5:** `npm test -w @swim/swimmer && npm run build -w @swim/swimmer` → PASS。
- [ ] **Step 6:** Commit：`feat(swimmer): Providers + ProtectedRoute + 路由 + 外壳`

---

### Task 12: 认领页 + 登录页（TDD）

**Files:** Create `src/features/auth/ClaimPage.tsx`(+test)、`src/features/auth/LoginPage.tsx`(+test)。

- [ ] **Step 1（ClaimPage 测试）** mock `GET /api/auth/claim/:token`→{name,email}，渲染 email；填密码点认领→`POST /api/auth/claim`→存 token→跳 `/`。错误令牌→显示文案。
- [ ] **Step 2-3:** ClaimPage（`useParams` token；进入即查 claim info；表单密码≥8+确认；`claim` 成功 `setAuth`+`getMe`+`navigate('/')`；404/410/409 给文案）。LoginPage（email+password→login→setAuth→`/`）。
- [ ] **Step 4:** `npm test -w @swim/swimmer -- ClaimPage LoginPage` → PASS。
- [ ] **Step 5:** Commit：`feat(swimmer): 认领页 + 登录页`

---

### Task 13: 看板页（汇总 + 热力图）（TDD）

**Files:** Create `src/features/dashboard/DashboardPage.tsx`(+test)、`src/features/dashboard/SummaryCards.tsx`、`HeatmapCard.tsx`。

- [ ] **Step 1（测试）** mock summary/heatmap → 渲染总里程数值 + 醒目「记录一次游泳」按钮跳 `/record`。
- [ ] **Step 2-3:** DashboardPage（`useMySummary`+`useMyHeatmap`；SummaryCards 三数值；HeatmapCard 复用 `@uiw/react-heat-map`；CTA 按钮）。
- [ ] **Step 4:** PASS。 **Step 5:** Commit：`feat(swimmer): 个人看板（汇总+热力图）`

---

### Task 14: 录入页（选池 + 提交）（TDD）

**Files:** Create `src/features/record/RecordPage.tsx`(+test)。

- [ ] **Step 1（测试）** mock `GET /api/me/pools`→[{id,name}]；选池+填距离+日期→提交→`POST /api/sessions`（body 含 poolId/distanceMeters/swamAt）→跳 `/`。
- [ ] **Step 2-3:** RecordPage（`useMyPools` 填 antd-mobile `Selector`/`Picker`；距离 `Input number`；日期 `DatePicker` 默认今天；`useRecordSession` 提交，`swamAt` 用 `dayjs(...).toISOString()`；成功 `Toast`+`navigate('/')`）。
- [ ] **Step 4:** PASS。 **Step 5:** Commit：`feat(swimmer): 自助录入（选所属泳池）`

---

### Task 15: 历史页（TDD）

**Files:** Create `src/features/history/HistoryPage.tsx`(+test)。

- [ ] **Step 1（测试）** mock `GET /api/sessions/me`→[{...}]；渲染距离/日期列表。
- [ ] **Step 2-3:** HistoryPage（`useMySessions`；antd-mobile `List`，每项距离/时长/日期，空态文案）。
- [ ] **Step 4:** PASS。 **Step 5:** Commit：`feat(swimmer): 我的游泳历史`

---

### Task 16: 终验 + 文档/CI 收口

- [ ] **Step 1:** 全量门禁：`npm run lint && npm run build && npm test && npm run test:e2e` → 全绿。
- [ ] **Step 2:** 实跑：`npm run dev` 三端；owner 建游泳者→生成链接→在 swimmer App 打开 `/claim/<token>`→设密码→录入→owner 单泳池看板出现该记录；截图/记录。
- [ ] **Step 3:** README 增「游泳者端（apps/swimmer）」段：端口 5174、认领流程、`SWIMMER_APP_URL`/CORS 加 5174；`.env.example` 加 `SWIMMER_APP_URL`。
- [ ] **Step 4:** Commit：`docs: 游泳者端说明 + SWIMMER_APP_URL/CORS`。
- [ ] **Step 5:** 自评估/代码评审；finishing-a-development-branch。
