# 标准化分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement task-by-task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 给 `GET /sessions/me`（泳动历史）与 `GET /pools/:id/swimmers`（名册）加 offset 分页，统一 `Paginated<T>` 信封 + 可复用原语；游泳者历史「加载更多」、owner 名册服务端分页。

**Architecture:** `@swim/shared` 加 `Paginated<T>`；`common/pagination`（`PaginationQuery` DTO + `paginate()`）；两 service 返回分页对象；两控制器收 `@Query() PaginationQuery`；swimmer 用 `useInfiniteQuery`，web 用 antd Table 服务端分页。无迁移。

**Tech Stack:** NestJS（class-validator/transformer）· Prisma（skip/take/count）· React（@tanstack/react-query v5 useInfiniteQuery / antd Table）。

## Global Constraints

- offset 分页：`page≥1` 默认 1、`pageSize` 1–100 默认 20、上限 100。
- 仅 `/sessions/me`、`/pools/:id/swimmers` 改为 `Paginated<T>`；其余列表端点不动。
- 不做筛选/排序；无迁移。
- 现有 104 单测 / 23 e2e / 两端前端测试不回归（更新这两个端点的相关断言）；TDD：红→绿→提交。

---

### Task 1: 共享 `Paginated` + 分页原语

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/common/pagination.ts`
- Test: `apps/api/src/common/pagination.spec.ts`

**Interfaces:**
- Produces: `Paginated<T>`（shared）；`PaginationQuery`（DTO）；`paginate(page?, pageSize?) → { skip, take, page, pageSize }`。

- [ ] **Step 1: shared 加类型** —— `packages/shared/src/index.ts` 末尾加：

```ts
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; }
```
然后 `npm run build -w @swim/shared`。

- [ ] **Step 2: 失败测试** `apps/api/src/common/pagination.spec.ts`

```ts
import { paginate } from './pagination';

describe('paginate', () => {
  it('默认 page=1 pageSize=20 skip=0', () => {
    expect(paginate()).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });
  it('page=3 pageSize=10 → skip=20', () => {
    expect(paginate(3, 10)).toEqual({ skip: 20, take: 10, page: 3, pageSize: 10 });
  });
  it('pageSize 上限 100、非法回落默认', () => {
    expect(paginate(1, 500).pageSize).toBe(100);
    expect(paginate(0, 0)).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });
});
```

- [ ] **Step 3: 跑测试确认失败** — `npm test -w @swim/api -- pagination` → FAIL。

- [ ] **Step 4: 实现** `apps/api/src/common/pagination.ts`

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export function paginate(
  page?: number,
  pageSize?: number,
): { skip: number; take: number; page: number; pageSize: number } {
  const p = page && page > 0 ? page : 1;
  const ps = pageSize && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  return { skip: (p - 1) * ps, take: ps, page: p, pageSize: ps };
}
```

- [ ] **Step 5: 跑测试确认通过** — PASS。

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/index.ts apps/api/src/common/pagination.ts apps/api/src/common/pagination.spec.ts
git commit -m 'feat(shared+api): Paginated<T> 信封 + 分页原语'
```

---

### Task 2: 后端两端点分页 + e2e

**Files:**
- Modify: `apps/api/src/sessions/sessions.service.ts` · `apps/api/src/sessions/sessions.controller.ts`
- Modify: `apps/api/src/pools/pools.service.ts` · `apps/api/src/pools/pools.controller.ts`
- Test: `apps/api/src/sessions/sessions.service.spec.ts`（若存在/新增）· `apps/api/src/pools/pools.service.spec.ts`
- Modify e2e: `apps/api/test/swimmer-flows.e2e-spec.ts` / `owner-flows.e2e-spec.ts`（更新断言为 `.items` + 新增分页断言）

**Interfaces:**
- Consumes: `paginate`、`Paginated`、`PaginationQuery`。
- Produces: `SessionsService.listForSwimmer(swimmerId, page?, pageSize?)` 与 `PoolsService.listSwimmers(ownerId, poolId, page?, pageSize?)` 返回 `{ items, total, page, pageSize }`。

- [ ] **Step 1: sessions.service.listForSwimmer 改分页**

```ts
// import { paginate } from '../common/pagination';
  async listForSwimmer(swimmerId: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = { swimmerId };
    const [items, total] = await Promise.all([
      this.prisma.swimSession.findMany({ where, orderBy: { swamAt: 'desc' }, skip, take }),
      this.prisma.swimSession.count({ where }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }
```

- [ ] **Step 2: sessions.controller.mine 收分页 query**

```ts
// import { PaginationQuery } from '../common/pagination'; import { Query } from '@nestjs/common';
  @Get('me')
  @Roles(Role.SWIMMER)
  mine(@CurrentUser() user: { id: string }, @Query() q: PaginationQuery) {
    return this.sessions.listForSwimmer(user.id, q.page, q.pageSize);
  }
```

- [ ] **Step 3: pools.service.listSwimmers 改分页**（返回 `Promise<Paginated<SwimmerListItem>>`）

把 `regs = findMany({ where:{poolId}, include, orderBy })` 改为带 `skip,take`，并加 `count`：
```ts
// import { paginate } from '../common/pagination'; import { Paginated } from '@swim/shared';
  async listSwimmers(ownerId: string, poolId: string, page?: number, pageSize?: number): Promise<Paginated<SwimmerListItem>> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const [regs, total] = await Promise.all([
      this.prisma.registration.findMany({
        where: { poolId },
        include: { swimmer: { select: { id: true, name: true, email: true, claimedAt: true } } },
        orderBy: { joinedAt: 'desc' },
        skip, take,
      }),
      this.prisma.registration.count({ where: { poolId } }),
    ]);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const items = await Promise.all(
      regs.map(async (r) => {
        const agg = await this.prisma.swimSession.aggregate({
          where: { swimmerId: r.swimmerId, poolId, swamAt: { gte: since } },
          _sum: { distanceMeters: true },
        });
        return {
          swimmerId: r.swimmer.id, name: r.swimmer.name, email: r.swimmer.email,
          status: r.status, claimedAt: r.swimmer.claimedAt ? r.swimmer.claimedAt.toISOString() : null,
          mileageLast30dMeters: agg._sum.distanceMeters ?? 0, joinedAt: r.joinedAt.toISOString(),
        };
      }),
    );
    return { items, total, page: p, pageSize: ps };
  }
```

- [ ] **Step 4: pools.controller 名册 GET 收分页 query** —— 找到 `@Get(':id/swimmers')` 方法（owner 名册），加 `@Query() q: PaginationQuery`，调 `this.pools.listSwimmers(user.id, id, q.page, q.pageSize)`。import `PaginationQuery`。

- [ ] **Step 5: 改后端单测**（service spec）—— 找 `pools.service.spec.ts` 的 `listSwimmers` 测试与（如有）`sessions.service.spec.ts`，把断言由数组改为 `res.items`，并断言 `res.total/page/pageSize`；service 实例化与 mock 不变（mock `findMany`/`count`/`aggregate`）。若 sessions 无 spec，新建最小 spec 断言 `listForSwimmer` 返回 `{items,total,page,pageSize}`（mock prisma `swimSession.findMany`→`[{...}]`、`count`→1）。

- [ ] **Step 6: 跑单测** — `npm test -w @swim/api` → 全绿（更新后）。

- [ ] **Step 7: 改 e2e** —— `npm run test:e2e` 跑一遍找出断言这两个端点为数组的用例（swimmer-flows 的 `/sessions/me`、owner-flows 的名册），把 `.body`/`.length` 断言改为 `.body.items`/`.body.items.length`，并在其一加 `expect(res.body).toMatchObject({ page: 1, pageSize: expect.any(Number) }); expect(typeof res.body.total).toBe('number');`。

- [ ] **Step 8: 跑 e2e** — `npm run test:e2e` → 全绿。

- [ ] **Step 9: 提交**

```bash
git add apps/api/src/sessions apps/api/src/pools apps/api/test
git commit -m 'feat(api): /sessions/me 与 /pools/:id/swimmers offset 分页'
```

---

### Task 3: 前端游泳者历史「加载更多」

**Files:**
- Modify: `apps/swimmer/src/lib/api/endpoints.ts` · `apps/swimmer/src/lib/queries.ts` · `apps/swimmer/src/features/history/HistoryPage.tsx`
- Modify: `apps/swimmer/src/test/msw.ts`（`/sessions/me` 默认返回分页信封）
- Test: `apps/swimmer/src/features/history/HistoryPage.test.tsx`

- [ ] **Step 1: endpoints** —— 把 `getMySessions` 改为：

```ts
import type { Paginated } from '@swim/shared';
export const getMySessions = (page = 1) =>
  api.get<Paginated<SwimSessionItem>>('/sessions/me', { params: { page } }).then((r) => r.data);
```

- [ ] **Step 2: queries（useInfiniteQuery）**

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
export const useMySessions = () =>
  useInfiniteQuery({
    queryKey: ['sessions', 'me'],
    queryFn: ({ pageParam }) => ep.getMySessions(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
```

- [ ] **Step 3: msw 默认** —— `apps/swimmer/src/test/msw.ts` 的 `/api/sessions/me` 处理器改为返回 `{ items: [], total: 0, page: 1, pageSize: 20 }`。

- [ ] **Step 4: 失败测试** `HistoryPage.test.tsx`

```ts
import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { HistoryPage } from './HistoryPage';

it('展示首页并「加载更多」追加下一页', async () => {
  server.use(
    http.get('/api/sessions/me', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
      const item = (n: number) => ({ id: `s${n}`, distanceMeters: n * 100, durationSeconds: null, swamAt: '2026-06-01T00:00:00.000Z', poolId: null, createdAt: '2026-06-01T00:00:00.000Z' });
      return HttpResponse.json(page === 1
        ? { items: [item(1)], total: 2, page: 1, pageSize: 1 }
        : { items: [item(2)], total: 2, page: 2, pageSize: 1 });
    }),
  );
  renderWithProviders(<HistoryPage />, { route: '/history' });
  expect(await screen.findByText('100 米')).toBeInTheDocument();
  await userEvent.click(screen.getByText('加载更多'));
  await waitFor(() => expect(screen.getByText('200 米')).toBeInTheDocument());
});
```

- [ ] **Step 5: 跑测试确认失败** — `npm test -w @swim/swimmer -- HistoryPage` → FAIL。

- [ ] **Step 6: 改 HistoryPage**

```tsx
import { Button, Card, List, DotLoading } from 'antd-mobile';
import dayjs from 'dayjs';
import { useMySessions } from '../../lib/queries';

export function HistoryPage() {
  const q = useMySessions();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card title="我的游泳历史">
      {q.isLoading ? (
        <div style={{ padding: 16, textAlign: 'center' }}><DotLoading /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: 16, color: '#999' }}>还没有记录，去「看板」记录第一次游泳吧</div>
      ) : (
        <>
          <List>
            {items.map((s) => (
              <List.Item key={s.id} description={`${dayjs(s.swamAt).format('YYYY-MM-DD')}${s.durationSeconds ? ` · ${s.durationSeconds} 秒` : ''}`}>
                {s.distanceMeters} 米
              </List.Item>
            ))}
          </List>
          {q.hasNextPage && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Button block loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>加载更多</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: 跑 swimmer 全量单测** — `npm test -w @swim/swimmer` → 全绿。

- [ ] **Step 8: 提交**

```bash
git add apps/swimmer/src
git commit -m 'feat(swimmer): 历史「加载更多」分页'
```

---

### Task 4: 前端 owner 名册服务端分页

**Files:**
- Modify: `apps/web/src/lib/api/endpoints.ts` · `apps/web/src/lib/queries.ts` · `apps/web/src/features/swimmers/RosterTable.tsx`
- Modify: `apps/web/src/test/msw.ts`（`/pools/:id/swimmers` 返回分页信封）
- Test: `apps/web/src/features/swimmers/RosterTable.test.tsx`（若存在则更新；否则新增最小用例）

- [ ] **Step 1: endpoints** —— `listSwimmers` 改为：

```ts
import type { Paginated } from '@swim/shared';
export const listSwimmers = (poolId: string, page = 1) =>
  api.get<Paginated<SwimmerListItem>>(`/pools/${poolId}/swimmers`, { params: { page } }).then((r) => r.data);
```

- [ ] **Step 2: queries** —— `useSwimmers` 改为带 page：

```ts
export const useSwimmers = (poolId: string, page = 1) =>
  useQuery({ queryKey: [...queryKeys.swimmers(poolId), page], queryFn: () => ep.listSwimmers(poolId, page) });
```
（`queryKeys.swimmers(poolId)` 仍 `['swimmers', poolId]`，失效用前缀匹配仍生效。）

- [ ] **Step 3: msw 默认** —— `apps/web/src/test/msw.ts` 若有 `/api/pools/.../swimmers` 默认处理器，改返回 `{ items: [], total: 0, page: 1, pageSize: 20 }`；RosterTable 测试用 `server.use` 覆盖具体数据。

- [ ] **Step 4: 改 RosterTable**（服务端分页）

- 加 `const [page, setPage] = useState(1);`，`const swimmers = useSwimmers(poolId, page);`
- `<Table ... dataSource={swimmers.data?.items ?? []} pagination={{ current: page, pageSize: 20, total: swimmers.data?.total ?? 0, onChange: setPage }} />`

- [ ] **Step 5: 测试**（`RosterTable.test.tsx`，按既有 web 测试写法；若不存在则新增）

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RosterTable } from './RosterTable';

describe('RosterTable', () => {
  it('渲染分页名册数据', async () => {
    server.use(
      http.get('/api/pools/p1/swimmers', () =>
        HttpResponse.json({
          items: [{ swimmerId: 's1', name: 'Sam', email: 's@x.com', status: 'ACTIVE', claimedAt: null, mileageLast30dMeters: 0, joinedAt: '2026-06-01T00:00:00.000Z' }],
          total: 1, page: 1, pageSize: 20,
        }),
      ),
    );
    renderWithProviders(<RosterTable poolId="p1" />);
    expect(await screen.findByText('s@x.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 跑 web 全量单测** — `npm test -w @swim/web` → 全绿（更新既有 RosterTable/Roster 相关测试为分页形状）。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src
git commit -m 'feat(web): owner 名册服务端分页'
```

---

### Task 5: 终验 + README + 自评审 + 通知

- [ ] **Step 1: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 2: 实跑** —— `curl 'localhost:3000/sessions/me?pageSize=2'`（带 token）见 `{items,total,page,pageSize}`；owner 名册翻页。

- [ ] **Step 3: README** —— 接口一览给 `GET /sessions/me`、`GET /pools/:id/swimmers` 标注「分页（`page`/`pageSize`，返回 `Paginated`）」。

- [ ] **Step 4: 自评审** —— `pageSize` 上限 100；两端点返回信封；既有其它端点不变；全部测试绿。

- [ ] **Step 5: 提交 + 通知**

```bash
git add README.md && git commit -m 'docs: 列表分页（/sessions/me、名册）'
```
通知用户 #4b 完成 + 全量门禁绿 + 剩 #4c（幂等）/#4d（API keys，#3 后）。

## Self-Review（plan vs spec）

- **Spec coverage**：Paginated+原语(T1) · 两端点(T2) · e2e(T2) · 游泳者加载更多(T3) · owner 名册分页(T4) · README(T5) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；e2e/既有测试更新处给出明确规则（改 `.items`/分页信封），非占位。
- **Type consistency**：`Paginated<T>`、`paginate()→{skip,take,page,pageSize}`、`listForSwimmer(id,page?,pageSize?)`、`listSwimmers(ownerId,poolId,page?,pageSize?)`、endpoints `getMySessions(page)`/`listSwimmers(poolId,page)` 跨任务一致。
- **风险**：返回类型变更 → 同片更新两端点的 e2e/单测/前端消费（T2/T3/T4）；invalidation 用前缀匹配仍生效。
