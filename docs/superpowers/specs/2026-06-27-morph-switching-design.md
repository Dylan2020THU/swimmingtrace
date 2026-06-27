# 形态切换 · Phase 2-C 设计

- **日期**：2026-06-27
- **分支**：feat/phase2-morph（从 feat/phase2-challenges 切出，依赖 B 的挑战）
- **状态**：已确认（用户授权自主推进，跳过 spec 复审）
- **上游**：[[2026-06-26-owner-console-phase1-design]] §1 愿景"会随赛事状态切换形态的控制台"；接续 B [[2026-06-27-challenges-leaderboard-design]]

---

## 1. 背景与定位

权威愿景把控制台描述为**随赛事状态切换形态**：无赛事 → 默认「会员/场馆」日常运营形态；有赛事 → 叠加「赛事/挑战组织」形态。B 落地了挑战与排行榜，本子项目（C）把控制台**真正随赛事状态自适应**——纯呈现层，无新数据模型。

按 YAGNI：**自动**判定形态（不做手动开关）、**自适应表面**（不做独立赛事看板页）。

## 2. 目标与非目标

### 目标
- owner 在任一未归档泳池有"进行中"挑战（now ∈ [startDate, endDate)）时，控制台进入「赛事形态」；否则「日常运营形态」。自动判定。
- 「赛事形态」三处自适应表面：
  1. **总览页顶部**：跨泳池「进行中的挑战」区（泳池名·挑战名、进度、入口）。
  2. **顶栏徽标**：「赛事进行中」Tag。
  3. **单泳池详情**：该池有进行中挑战时，「挑战」卡上提到顶部。

### 非目标
- 手动形态切换开关、独立「赛事看板」页、任何新数据模型/迁移。
- 游泳者端形态切换（本期仅 owner 控制台）。
- 历史/已结束挑战的归档视图。

## 3. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | **自动**判定形态（无手动开关） | 契合"随赛事状态切换"；少一层状态与持久化 |
| D2 | "进行中" = `startDate <= now < endDate` | 与 B 窗口语义一致 |
| D3 | 跨泳池活跃挑战用**一个新端点** `GET /challenges/active` | 总览区 + 顶栏徽标共用；避免前端 N+1 逐池拉取 |
| D4 | 单泳池详情判活**复用 `usePoolChallenges`** | React Query 同 key 命中缓存，不额外请求；客户端按日期窗口判活 |
| D5 | 纯前端呈现自适应，后端只加只读聚合端点 | 无新模型、风险最低 |

## 4. 后端

| 方法 路径 | 角色 | 作用 |
|---|---|---|
| `GET /challenges/active` | OWNER | 我**未归档**泳池中"进行中"的挑战，含 `poolName` + 进度，按 endDate 升序 |

- `ChallengesService.activeForOwner(ownerId): ActiveChallengeItem[]`：取 owner `archivedAt = null` 的泳池 → 这些池里 `startDate <= now AND endDate > now` 的挑战（include pool.name）→ 每条算窗口内池总里程（复用 `swimSession.aggregate`）。
- 类型（`@swim/shared`）：`export interface ActiveChallengeItem extends ChallengeSummary { poolName: string; }`
- 路由挂在现有 `ChallengesController`（`@Get('challenges/active')`，置于 `@Get('challenges/:cid')` **之前**避免 `active` 被当作 `:cid`）。

## 5. 前端（apps/web）

- **端点/hook**：`getActiveChallenges()` → `useActiveChallenges()`（queryKey `['challenges','active']`）。
- **`ActiveChallengesBanner`**（新组件）：用 `useActiveChallenges`；非空时渲染 AntD `Card`「进行中的挑战」列表（`泳池名 · 挑战名`、`Progress`、点击 `navigate('/pools/:poolId/challenges/:cid')`）；空则渲染 `null`。置于 `OverviewPage` 顶部（StatCards 之上）。
- **`AppLayout` 顶栏徽标**：用 `useActiveChallenges`；非空时在品牌旁显示 `Tag color="gold"`「赛事进行中」。
- **`PoolDetailPage` 上提**：`const challenges = usePoolChallenges(poolId)`；`hasActive = (challenges.data ?? []).some(c => now>=start && now<end)`；`hasActive` 时把 `<ChallengesCard>` 渲染在 `<RosterTable>` 之前，否则维持现序。

## 6. 错误处理
沿用既有：`useActiveChallenges` 失败时 Banner/徽标按"无活跃"处理（不打断主流程，401 由全局拦截器兜）。

## 7. 测试（TDD）
- **后端单测**（mock Prisma）：`activeForOwner` 取未归档池、按窗口过滤、含 poolName + 进度；空池 → 空。
- **web**：`ActiveChallengesBanner`（有活跃→渲染、无→不渲染）；`AppLayout` 徽标（有/无活跃显隐）；`PoolDetailPage` 上提顺序（可选，断言挑战卡在名册之前）。
- **e2e**：扩展 challenge-flows——建进行中挑战后 `GET /challenges/active` 含它、含 poolName/进度；建一个**已结束**挑战不出现在 active。

## 8. 实现顺序（供 writing-plans）
1. 共享类型 `ActiveChallengeItem`。
2. 后端 `activeForOwner` + `GET /challenges/active`（TDD）+ e2e 扩展。
3. web 端点/hook + `ActiveChallengesBanner` + OverviewPage 接入（TDD）。
4. web 顶栏徽标（AppLayout）+ PoolDetailPage 上提（TDD）。
5. 终验 + 评审。
