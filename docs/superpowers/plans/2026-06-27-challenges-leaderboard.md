# 挑战 + 排行榜（Phase 2-B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 superpowers:executing-plans，逐任务实现。Steps 用 `- [ ]` 跟踪。

**Goal:** owner 在泳池发起带目标的挑战，系统基于既有 `SwimSession` 聚合算出进度与排行榜；游泳者端看我所属池的进行中挑战与我的名次。

**Architecture:** 新建 `apps/api` challenges 模块（建/列/详情+排行榜/删）+ `me` 加 `/me/challenges`；`apps/web` 单泳池详情加挑战卡 + 详情页；`apps/swimmer` 加挑战 Tab；`@swim/shared` 加类型。复用 Phase 1/2-A 鉴权、所有权工具、前端模式、测试工具链。

**Tech Stack:** NestJS 10 · Prisma 5 · PostgreSQL · class-validator · React 18 · Vite · AntD（web）/ antd-mobile（swimmer）· TanStack Query · Jest/supertest · Vitest/RTL/MSW。

## Global Constraints
- 设计见 `docs/superpowers/specs/2026-06-27-challenges-leaderboard-design.md`。
- 单 `Challenge` 实体，复用 `SwimSession` 聚合；目标=泳池集体里程；窗口 `swamAt >= start AND < end`。
- owner 接口 `@Roles(OWNER)` + 所有权；游泳者 `@Roles(SWIMMER)`；删挑战硬删；`endDate>startDate` 否则 400。
- 所有"过 HTTP 的类型"来自 `@swim/shared`。频繁提交；每后端 Task 跑 `npm run test -w @swim/api` + build；前端跑对应 test/build。

---

### Task 1: `Challenge` 模型 + 迁移
**Files:** Modify `apps/api/prisma/schema.prisma`；Create `apps/api/prisma/migrations/<ts>_add_challenge/migration.sql`
- [ ] schema 加 `model Challenge {...}`（见 spec §5）+ `Pool.challenges Challenge[]`。
- [ ] 生成迁移：`cd apps/api && TS=$(date +%Y%m%d%H%M%S) && mkdir -p prisma/migrations/${TS}_add_challenge && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/${TS}_add_challenge/migration.sql`
- [ ] `npm run prisma:deploy -w @swim/api && npm run prisma:generate -w @swim/api`。
- [ ] Commit `feat(db): Challenge 模型`。

### Task 2: `@swim/shared` 挑战类型
**Files:** Modify `packages/shared/src/index.ts`（追加 spec §6.1 全部类型）；build shared。Commit `feat(shared): 挑战类型`。

### Task 3: 所有权工具 + createChallenge + list（含进度）（TDD）
**Files:** Create `apps/api/src/challenges/{challenges.service.ts,challenges.controller.ts,challenges.module.ts,challenges.service.spec.ts}`；Modify `common/ownership.ts`（加 `assertOwnsChallenge`）、`app.module.ts`（imports 加 ChallengesModule）。
**Produces:** `ChallengesService.create(ownerId, poolId, dto)`、`listForPool(ownerId, poolId): ChallengeSummary[]`；`assertOwnsChallenge(prisma, ownerId, cid)`；路由 `POST/GET /pools/:id/challenges`。
- [ ] **失败测试**（challenges.service.spec.ts）：
```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

const okDto = { name: 'C', goalDistanceMeters: 100000, startDate: '2026-06-01', endDate: '2026-07-01' };

describe('ChallengesService.create', () => {
  it('校验所有权后创建', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    await new ChallengesService(prisma).create('o1', 'p1', okDto);
    expect(prisma.challenge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ poolId: 'p1', name: 'C', goalDistanceMeters: 100000 }),
    }));
  });
  it('endDate<=startDate → BadRequest', async () => {
    const prisma: any = { pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) }, challenge: { create: jest.fn() } };
    await expect(new ChallengesService(prisma).create('o1', 'p1', { ...okDto, endDate: '2026-06-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('非本人池 → 403', async () => {
    const prisma: any = { pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) }, challenge: { create: jest.fn() } };
    await expect(new ChallengesService(prisma).create('o1', 'p1', okDto)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ChallengesService.listForPool', () => {
  it('返回挑战含窗口内池总里程', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01') }]) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 42000 } }) },
    };
    const res = await new ChallengesService(prisma).listForPool('o1', 'p1');
    expect(res[0]).toMatchObject({ id: 'c1', goalDistanceMeters: 100000, totalDistanceMeters: 42000 });
  });
});
```
- [ ] **实现** `challenges.service.ts`：
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ChallengeSummary, CreateChallengeDto, ChallengeDetail, LeaderboardRow } from '@swim/shared';
import { assertOwnsPool, assertOwnsChallenge } from '../common/ownership';
import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class CreateChallengeBody implements CreateChallengeDto {
  @IsString() name: string;
  @IsInt() @Min(1) goalDistanceMeters: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

@Injectable()
export class ChallengesService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, poolId: string, dto: CreateChallengeDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const start = new Date(dto.startDate); const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('结束日期需晚于开始日期');
    return this.prisma.challenge.create({ data: { poolId, name: dto.name, goalDistanceMeters: dto.goalDistanceMeters, startDate: start, endDate: end } });
  }

  private async windowTotal(poolId: string, start: Date, end: Date): Promise<number> {
    const agg = await this.prisma.swimSession.aggregate({ where: { poolId, swamAt: { gte: start, lt: end } }, _sum: { distanceMeters: true } });
    return agg._sum.distanceMeters ?? 0;
  }
  private toSummary(c: any, total: number): ChallengeSummary {
    return { id: c.id, poolId: c.poolId, name: c.name, goalDistanceMeters: c.goalDistanceMeters,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(), totalDistanceMeters: total };
  }

  async listForPool(ownerId: string, poolId: string): Promise<ChallengeSummary[]> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const list = await this.prisma.challenge.findMany({ where: { poolId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(list.map(async (c) => this.toSummary(c, await this.windowTotal(poolId, c.startDate, c.endDate))));
  }
}
```
- [ ] `challenges.controller.ts`：`@Controller('pools/:id/challenges')` 无法同时挂 `/challenges/:cid` —— 用两个 controller 或单 controller 多路由。本 Task 用 `@Controller()` + 显式路径：
```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ChallengesService, CreateChallengeBody } from './challenges.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

type AuthedUser = { id: string; role: Role };

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChallengesController {
  constructor(private challenges: ChallengesService) {}

  @Post('pools/:id/challenges')
  @Roles(Role.OWNER)
  create(@CurrentUser() u: AuthedUser, @Param('id') poolId: string, @Body() dto: CreateChallengeBody) {
    return this.challenges.create(u.id, poolId, dto);
  }
  @Get('pools/:id/challenges')
  @Roles(Role.OWNER)
  list(@CurrentUser() u: AuthedUser, @Param('id') poolId: string) {
    return this.challenges.listForPool(u.id, poolId);
  }
}
```
- [ ] `common/ownership.ts` 加：
```ts
export async function assertOwnsChallenge(prisma: PrismaService, ownerId: string, challengeId: string) {
  const c = await prisma.challenge.findUnique({ where: { id: challengeId }, include: { pool: true } });
  if (!c) throw new NotFoundException('Challenge not found');
  if (c.pool.ownerId !== ownerId) throw new ForbiddenException();
  return c;
}
```
- [ ] `challenges.module.ts`（controllers:[ChallengesController], providers:[ChallengesService, PrismaService]）；`app.module.ts` imports 加 `ChallengesModule`。
- [ ] 测试通过 + build；Commit `feat(api): 创建/列出泳池挑战（含进度）`。

### Task 4: 挑战详情 + 排行榜 + 删除（TDD）
**Files:** Modify `challenges.service.ts`、`challenges.controller.ts`、`challenges.service.spec.ts`。
**Produces:** `detail(ownerId, cid): ChallengeDetail`、`remove(ownerId, cid)`；路由 `GET/DELETE /challenges/:cid`。
- [ ] **失败测试**：
```ts
describe('ChallengesService.detail', () => {
  it('返回详情 + 排行榜（降序）', async () => {
    const c = { id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), pool: { ownerId: 'o1' } };
    const prisma: any = {
      challenge: { findUnique: jest.fn().mockResolvedValue(c) },
      $queryRaw: jest.fn().mockResolvedValue([
        { swimmerId: 's1', name: 'A', email: 'a@x', distanceMeters: BigInt(5000) },
        { swimmerId: 's2', name: 'B', email: 'b@x', distanceMeters: BigInt(3000) },
      ]),
    };
    const res = await new ChallengesService(prisma).detail('o1', 'c1');
    expect(res.leaderboard[0]).toEqual({ swimmerId: 's1', name: 'A', email: 'a@x', distanceMeters: 5000 });
    expect(res.totalDistanceMeters).toBe(8000);
  });
});
```
- [ ] **实现**：import `assertOwnsChallenge`、`Prisma`（@prisma/client）、`ChallengeDetail`/`LeaderboardRow`。
```ts
  async detail(ownerId: string, challengeId: string): Promise<ChallengeDetail> {
    const c = await assertOwnsChallenge(this.prisma, ownerId, challengeId);
    const rows = await this.prisma.$queryRaw<{ swimmerId: string; name: string | null; email: string; distanceMeters: bigint }[]>(Prisma.sql`
      SELECT s."swimmerId" AS "swimmerId", u."name" AS "name", u."email" AS "email", SUM(s."distanceMeters") AS "distanceMeters"
      FROM "SwimSession" s JOIN "User" u ON u."id" = s."swimmerId"
      WHERE s."poolId" = ${c.poolId} AND s."swamAt" >= ${c.startDate} AND s."swamAt" < ${c.endDate}
      GROUP BY s."swimmerId", u."name", u."email"
      ORDER BY SUM(s."distanceMeters") DESC`);
    const leaderboard: LeaderboardRow[] = rows.map((r) => ({ swimmerId: r.swimmerId, name: r.name, email: r.email, distanceMeters: Number(r.distanceMeters) }));
    const total = leaderboard.reduce((a, r) => a + r.distanceMeters, 0);
    return { ...this.toSummary(c, total), leaderboard };
  }
  async remove(ownerId: string, challengeId: string) {
    await assertOwnsChallenge(this.prisma, ownerId, challengeId);
    return this.prisma.challenge.delete({ where: { id: challengeId } });
  }
```
- [ ] controller 加 `@Get('challenges/:cid')`/`@Delete('challenges/:cid')`（`@Roles(OWNER)`）。
- [ ] 测试 + build；**用真实库验证排行榜 SQL**（docker exec psql 跑一次聚合）。Commit `feat(api): 挑战详情+排行榜+删除`。

### Task 5: `GET /me/challenges`（TDD）
**Files:** Modify `me.service.ts`、`me.controller.ts`、`me.service.spec.ts`。
**Produces:** `MeService.myChallenges(swimmerId): MyChallengeItem[]`；路由 `GET /me/challenges` `@Roles(SWIMMER)`。
- [ ] **失败测试**：mock registration.findMany（我的 ACTIVE 池）、challenge.findMany（进行中）、$queryRaw（每挑战排行榜）→ 断言我的名次/里程/池进度。
- [ ] **实现**：取本人 ACTIVE poolIds → `challenge.findMany({ where: { poolId: { in }, startDate: { lte: now }, endDate: { gt: now } } })` → 每挑战跑同 detail 的排行榜 SQL（复用私有方法 `leaderboardOf(poolId,start,end)`）→ 算 total、myDistance（=我在 rows 的值或 0）、myRank（rows 中我的 index+1，或 null）。
- [ ] 测试 + build；Commit `feat(api): GET /me/challenges 我的挑战与名次`。
> 重构：把 detail 的排行榜 SQL 抽成私有 `leaderboardOf(poolId, start, end): Promise<LeaderboardRow[]>`，detail 与 myChallenges 共用。

### Task 6: 后端 e2e（TDD）
**Files:** Create `apps/api/test/challenge-flows.e2e-spec.ts`（结构同 swimmer-flows，beforeAll 清表）。
- [ ] 测：owner 注册→建池→建 2 游泳者→各代录不同里程（窗口内）→建挑战→`GET /challenges/:cid` 排行榜顺序与里程正确、total 正确→游泳者认领+登录→`GET /me/challenges` 我的名次正确；另一 owner 访问该挑战→403。
- [ ] `npm run test:e2e -w @swim/api` 全绿；Commit `test(api): 挑战与排行榜 e2e`。

### Task 7: owner 控制台挑战 UI（TDD）
**Files:** Create `apps/web/src/features/challenges/{ChallengesCard,ChallengeForm,ChallengeDetailPage,ChallengesCard.test}.tsx`；Modify `lib/api/endpoints.ts`、`lib/queries.ts`、`features/pools/PoolDetailPage.tsx`、`app/router.tsx`。
- [ ] endpoints：`listChallenges(poolId)`、`createChallenge(poolId,body)`、`getChallenge(cid)`、`deleteChallenge(cid)`。queries：`usePoolChallenges/useCreateChallenge/useChallenge/useDeleteChallenge`（失效相关 key）。
- [ ] `ChallengesCard`：AntD `Card` 列挑战（名、`start–end`、`Progress` 条 total/goal）+「新建挑战」`Modal`(ChallengeForm：名/目标/`DatePicker.RangePicker`)。集成进 `PoolDetailPage`。
- [ ] `ChallengeDetailPage`（路由 `/pools/:poolId/challenges/:cid`）：进度概览 + 排行榜 `Table`（名次/姓名/里程）。router 加该路由。
- [ ] 测试（ChallengesCard.test）：mock list + create → 新建后列表刷新。`npm run test -w @swim/web && npm run build -w @swim/web`。Commit `feat(web): 泳池挑战卡 + 详情排行榜`。

### Task 8: 游泳者端挑战 Tab（TDD）
**Files:** Create `apps/swimmer/src/features/challenges/{ChallengesPage,ChallengesPage.test}.tsx`；Modify `lib/api/endpoints.ts`、`lib/queries.ts`、`components/AppShell.tsx`（TabBar 加「挑战」）、`app/router.tsx`（加 `/challenges`）。
- [ ] endpoints：`getMyChallenges()`。queries：`useMyChallenges`。
- [ ] `ChallengesPage`：antd-mobile 列我的进行中挑战卡（池名/挑战名/`ProgressBar` total/goal/我的里程+名次）；空态文案。TabBar 加「挑战」→ `/challenges`。
- [ ] 测试：mock `/api/me/challenges` → 渲染我的名次。`npm run test -w @swim/swimmer && npm run build -w @swim/swimmer`。Commit `feat(swimmer): 挑战 Tab（我的进度与名次）`。

### Task 9: 终验 + 收尾
- [ ] 全量门禁 `npm run lint && npm run build && npm test && npm run test:e2e` 全绿。
- [ ] 实跑：建挑战→自录→owner 看排行榜/进度、游泳者看名次。
- [ ] 对抗式评审 → 修真问题。
- [ ] finishing-a-development-branch / 通知验收。
