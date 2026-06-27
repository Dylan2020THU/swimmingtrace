# 形态切换（Phase 2-C）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 superpowers:executing-plans。Steps 用 `- [ ]` 跟踪。

**Goal:** owner 控制台随赛事状态自适应：有进行中挑战时显示总览活跃挑战区 + 顶栏徽标 + 单泳池详情挑战卡上提。纯呈现层 + 一个只读聚合端点，无新数据模型。

**Architecture:** 后端 `ChallengesService.activeForOwner` + `GET /challenges/active`（owner 未归档池中 now∈[start,end) 的挑战，含 poolName+进度）；apps/web 加 `useActiveChallenges`、`ActiveChallengesBanner`（总览顶部）、AppLayout 顶栏 Tag、PoolDetailPage 条件上提挑战卡。

**Tech Stack:** NestJS 10 · Prisma 5 · React 18 · AntD · TanStack Query · Jest · Vitest/RTL/MSW。

## Global Constraints
- 设计见 `docs/superpowers/specs/2026-06-27-morph-switching-design.md`。
- "进行中" = `startDate <= now AND endDate > now`；仅 owner 未归档池。
- 自动判定形态，无手动开关、无新页、无新模型/迁移。`GET /challenges/active` `@Roles(OWNER)`，路由置于 `GET challenges/:cid` 之前。
- 频繁提交；每后端 Task 跑 `npm run test -w @swim/api` + build；web 跑 test/build。

---

### Task 1: 共享类型 `ActiveChallengeItem`
**Files:** Modify `packages/shared/src/index.ts`
- [ ] 追加：`export interface ActiveChallengeItem extends ChallengeSummary { poolName: string; }`
- [ ] `npm run build -w @swim/shared`；Commit `feat(shared): ActiveChallengeItem 类型`。

### Task 2: 后端 `activeForOwner` + `GET /challenges/active`（TDD）
**Files:** Modify `apps/api/src/challenges/challenges.service.ts`、`challenges.controller.ts`、`challenges.service.spec.ts`；扩展 `apps/api/test/challenge-flows.e2e-spec.ts`。
- [ ] **失败测试**（challenges.service.spec.ts 追加）：
```ts
describe('ChallengesService.activeForOwner', () => {
  it('取未归档池中进行中的挑战，含 poolName + 进度', async () => {
    const now = new Date();
    const prisma: any = {
      pool: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]) },
      challenge: { findMany: jest.fn().mockResolvedValue([
        { id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000,
          startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000),
          pool: { name: '晨曦' } },
      ]) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 4200 } }) },
    };
    const res = await new ChallengesService(prisma).activeForOwner('o1');
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1', archivedAt: null } }));
    expect(res[0]).toMatchObject({ id: 'c1', poolName: '晨曦', totalDistanceMeters: 4200 });
  });
  it('无泳池 → 空', async () => {
    const prisma: any = { pool: { findMany: jest.fn().mockResolvedValue([]) } };
    expect(await new ChallengesService(prisma).activeForOwner('o1')).toEqual([]);
  });
});
```
- [ ] **实现** `challenges.service.ts`：import `ActiveChallengeItem`。方法：
```ts
  async activeForOwner(ownerId: string): Promise<ActiveChallengeItem[]> {
    const pools = await this.prisma.pool.findMany({ where: { ownerId, archivedAt: null }, select: { id: true } });
    const poolIds = pools.map((p) => p.id);
    if (poolIds.length === 0) return [];
    const now = new Date();
    const list = await this.prisma.challenge.findMany({
      where: { poolId: { in: poolIds }, startDate: { lte: now }, endDate: { gt: now } },
      include: { pool: { select: { name: true } } },
      orderBy: { endDate: 'asc' },
    });
    return Promise.all(list.map(async (c) => {
      const agg = await this.prisma.swimSession.aggregate({ where: { poolId: c.poolId, swamAt: { gte: c.startDate, lt: c.endDate } }, _sum: { distanceMeters: true } });
      return { ...this.toSummary(c, agg._sum.distanceMeters ?? 0), poolName: c.pool.name };
    }));
  }
```
> `toSummary` 已是 private（B 引入）；方法返回 `ChallengeSummary` 字段 + `poolName`。
- [ ] **路由** `challenges.controller.ts`：在 `@Get('challenges/:cid')` **之前**加：
```ts
  @Get('challenges/active')
  @Roles(Role.OWNER)
  active(@CurrentUser() u: AuthedUser) {
    return this.challenges.activeForOwner(u.id);
  }
```
- [ ] **e2e 扩展**（challenge-flows）：现有 happy path 末尾加 `GET /challenges/active` 断言含该挑战（poolName/totalDistanceMeters）；再建一个已结束挑战（endDate 过去）断言不在 active。
- [ ] 测试 + build + e2e；Commit `feat(api): GET /challenges/active 进行中挑战聚合`。

### Task 3: web 活跃挑战区 + OverviewPage 接入（TDD）
**Files:** Modify `apps/web/src/lib/api/endpoints.ts`、`lib/queries.ts`、`features/pools/OverviewPage.tsx`；Create `features/challenges/ActiveChallengesBanner.tsx`(+test)。
- [ ] endpoints：`getActiveChallenges = () => api.get<ActiveChallengeItem[]>('/challenges/active').then(r=>r.data)`。queries：`queryKeys.activeChallenges=['challenges','active']`；`useActiveChallenges`。
- [ ] **失败测试**（ActiveChallengesBanner.test）：
```tsx
import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ActiveChallengesBanner } from './ActiveChallengesBanner';

it('有进行中挑战 → 渲染', async () => {
  server.use(http.get('/api/challenges/active', () => HttpResponse.json([
    { id: 'c1', poolId: 'p1', poolName: '晨曦', name: '夏挑', goalDistanceMeters: 10000, totalDistanceMeters: 3000, startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z' },
  ])));
  renderWithProviders(<Routes><Route path="/" element={<ActiveChallengesBanner />} /></Routes>, { route: '/' });
  expect(await screen.findByText(/夏挑/)).toBeInTheDocument();
});
it('无进行中挑战 → 不渲染', async () => {
  server.use(http.get('/api/challenges/active', () => HttpResponse.json([])));
  const { container } = renderWithProviders(<Routes><Route path="/" element={<ActiveChallengesBanner />} /></Routes>, { route: '/' });
  // 等一拍后容器为空
  await new Promise((r) => setTimeout(r, 0));
  expect(container.querySelector('.ant-card')).toBeNull();
});
```
- [ ] **实现** `ActiveChallengesBanner.tsx`：`useActiveChallenges`；`(data ?? []).length === 0` → `return null`；否则 AntD `Card`「进行中的挑战」+ `List`（`poolName · name`、`Progress` total/goal、点击 `navigate('/pools/'+poolId+'/challenges/'+id)`）。接入 `OverviewPage` 顶部（StatCards 之上）。
- [ ] msw 默认 handler 加 `http.get('/api/challenges/active', () => HttpResponse.json([]))`（避免 OverviewPage 等触发未处理请求）。
- [ ] 测试 + build；Commit `feat(web): 总览进行中挑战区（赛事形态）`。

### Task 4: 顶栏徽标 + 单泳池详情上提（TDD）
**Files:** Modify `apps/web/src/components/AppLayout.tsx`(+test)、`features/pools/PoolDetailPage.tsx`。
- [ ] **AppLayout**：`const active = useActiveChallenges()`；品牌旁 `{(active.data?.length ?? 0) > 0 && <Tag color="gold">赛事进行中</Tag>}`。AppLayout.test 既有用例 mock `/api/pools`；补 `/api/challenges/active`→[] 默认即可（msw 默认已加）；新增用例：mock active 非空 → 断言「赛事进行中」出现。
- [ ] **PoolDetailPage**：`const challenges = usePoolChallenges(poolId); const now = Date.now(); const hasActive = (challenges.data ?? []).some(c => Date.parse(c.startDate) <= now && now < Date.parse(c.endDate));`；`hasActive` 时 `<ChallengesCard>` 渲染在 `<RosterTable>` 之前，否则维持现序（RosterTable → ChallengesCard → PoolDashboard）。
- [ ] 测试 + build；Commit `feat(web): 顶栏赛事徽标 + 详情挑战卡上提`。

### Task 5: 终验 + 收尾
- [ ] 全量门禁 `npm run lint && npm run build && npm test && npm run test:e2e` 全绿。
- [ ] 实跑：有进行中挑战 → 总览区/顶栏徽标出现、详情挑战卡上提；删挑战后回落日常形态。
- [ ] 对抗式评审 → 修真问题；通知验收。
