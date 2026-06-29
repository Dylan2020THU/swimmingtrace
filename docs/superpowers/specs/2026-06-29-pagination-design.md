# 标准化分页（Pagination）— 设计

> API 质量子项目（#4）的第二片 **#4b**。给真正无界增长的列表端点加 offset 分页，抽出可复用原语。
> **无迁移**；仅两个端点返回类型由 `T[]` 变为 `Paginated<T>`。

## 背景与目标

现状：列表端点返回无界全量数组。真正会无界增长的是 `GET /sessions/me`（泳动历史，随每次游泳增长）与 `GET /pools/:id/swimmers`（名册，随会员增长）。目标：给这两个端点加 offset 分页，统一 `{ items, total, page, pageSize }` 信封，并抽出可复用的分页原语供后续端点采用。

## 范围与非目标

**范围**：`@swim/shared`（`Paginated<T>`）、`apps/api`（`common/pagination`、两端点 + 两 service、单测 + e2e）、`apps/swimmer`（HistoryPage 加载更多）、`apps/web`（RosterTable 服务端分页）、README。

**非目标**：筛选/排序参数（这两个端点暂无需求，YAGNI）；其余有界列表端点（`/pools`、`/me/pools`、`/me/challenges`、`/challenges/active`、`/pools/:id/challenges`）保持数组不变；cursor 分页；迁移。

## 设计

### 共享信封 + 后端原语

`@swim/shared`：

```ts
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; }
```

`apps/api/src/common/pagination.ts`：

```ts
export class PaginationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
export function paginate(page?: number, pageSize?: number): { skip: number; take: number; page: number; pageSize: number } {
  const p = page && page > 0 ? page : 1;
  const ps = pageSize && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  return { skip: (p - 1) * ps, take: ps, page: p, pageSize: ps };
}
```

默认 `page=1`、`pageSize=20`、`pageSize` 上限 100。

### 端点（返回 `Paginated<T>`）

- **`GET /sessions/me?page&pageSize`**：`SessionsService.listForSwimmer(swimmerId, page?, pageSize?)` → `prisma.swimSession.findMany({ where, orderBy:{swamAt:'desc'}, skip, take })` + `count({where})` → `{ items, total, page, pageSize }`。
- **`GET /pools/:id/swimmers?page&pageSize`**：`PoolsService.listSwimmers(ownerId, poolId, page?, pageSize?)` 同理（registration/user 聚合 + count）→ `Paginated<SwimmerListItem>`。

控制器各加 `@Query() q: PaginationQuery`，把 `q.page`/`q.pageSize` 透传给 service。

### 前端

- **游泳者 `HistoryPage`**（antd-mobile）：**加载更多**——状态保存已累积 `items` 与 `page`；首屏拉 page 1，点「加载更多」拉下一页并追加；`items.length >= total` 时隐藏按钮。`useSessionsMe(page)` 返回 `Paginated`。
- **owner `RosterTable`**（web，antd `Table`）：服务端分页——组件持 `page` 状态，`useRoster(poolId, page)` 返回 `Paginated`，`Table` 的 `pagination={{ current, pageSize, total, onChange }}`。

## 测试策略（TDD）

- **单测**：`paginate()`（默认/上限/skip 计算）；`SessionsService.listForSwimmer` 返回 `Paginated`（mock `findMany`+`count`）；`PoolsService.listSwimmers` 返回 `Paginated`。
- **e2e**：`GET /sessions/me?pageSize=2` → `items.length<=2` 且含 `total/page/pageSize`；名册分页同理。**更新**既有 e2e/单测中断言这两个端点为数组的地方为 `.items`。
- **FE**：HistoryPage 点加载更多追加；RosterTable 渲染分页数据（断言行数 = 当前页）。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| 返回类型 `T[]→Paginated<T>` 破坏既有断言/消费 | 同片内更新两端点的 e2e/单测/前端消费；其余端点不动 |
| 前端 query 形状变更 | 仅 `useSessionsMe`/`useRoster` 两个 + 其两个消费组件 |
| pageSize 滥用 | `paginate` 上限 100 |

## 验收标准

- `lint`/`build`(4 包)/`test`/`test:e2e` 全绿。
- 两端点支持 `page`/`pageSize`、返回 `{ items, total, page, pageSize }`、`pageSize` 上限 100。
- 游泳者历史可「加载更多」；owner 名册分页可翻页。
- README 接口一览标注这两个端点为分页。
