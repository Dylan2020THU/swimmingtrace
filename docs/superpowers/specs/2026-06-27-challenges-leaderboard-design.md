# 挑战 + 排行榜 · Phase 2-B 设计

- **日期**：2026-06-27
- **分支**：feat/phase2-challenges（从 feat/phase2-swimmer-self-service 切出，复用 A 的 apps/swimmer）
- **状态**：已确认（用户授权自主推进，跳过 spec 复审）
- **上游**：[[2026-06-26-owner-console-phase1-design]] 的 Phase 2 拆解之第二个子项目；接续 [[2026-06-27-swimmer-self-service-claim-design]]（A）

---

## 1. 背景与定位

Phase 1 交付 owner 控制台；Phase 2-A 让游泳者认领账号并自助录入。本子项目（Phase 2-B）落地权威愿景里的"**赛事 / 挑战形态**"中最小可用核心：owner 在泳池里**发起带目标的挑战**，系统基于既有游泳记录算出**进度**与**排行榜**。A 的自录数据正好成为排行榜的真实来源。

按 YAGNI 收敛：只引入**一个** `Challenge` 实体（时间窗内的"泳池集体里程目标 + 个人里程排行榜"），复用现有 `SwimSession` 聚合。**不**单独建 `Event` 容器、不做形态切换（→ 子项目 C）。

## 2. 目标与非目标

### 目标
- owner 在单泳池下**创建挑战**（名称、目标里程、起止日期）、列出挑战并看进度、看挑战详情（进度 + 排行榜）。
- 游泳者在移动端看**我所属池的进行中挑战**：池进度、我的里程与名次。
- 进度/排行榜实时由 `SwimSession`（含自录）聚合，无需新录入路径。

### 非目标（明确排除）
- 单独 `Event` 容器、赛事报名、奖励/勋章、通知。
- 形态切换 UI（→ 子项目 C）、跨池/全局挑战、按游泳者的个人目标（本期为**泳池集体目标** + 个人排行榜）。
- 挑战编辑（建后改名/改目标/改窗口）——本期仅建 + 删除（软处理见 D4）。
- refresh token、Playwright。

## 3. 关键决策记录

| # | 决策 | 取舍理由 |
|---|---|---|
| D1 | 只建 `Challenge` 一个实体，复用 `SwimSession` 聚合 | 最小核心即可交付"挑战+目标+排行榜"；不引入 Event/报名等重模型 |
| D2 | 目标 = **泳池集体里程**（窗口内全池总里程 vs `goalDistanceMeters`） | 比"每人目标"简单、契合"挑战"语义；个人维度由排行榜体现 |
| D3 | 排行榜 = 窗口内按 swimmer 求和里程降序 | 复用 stats 既有 `$queryRaw` 聚合风格；数据来自 A 的自录 + owner 代录 |
| D4 | 挑战删除 = **硬删**（`Challenge` 无历史价值，记录在 `SwimSession`） | YAGNI；session 不依赖 challenge，删挑战不丢任何里程数据 |
| D5 | 日期窗口：`startDate` 含、`endDate` **不含**（`swamAt >= start AND < end`） | 与 stats 年窗口语义一致，避免边界重复计 |
| D6 | 游泳者端新增「挑战」Tab（共 4 Tab） | 移动端 4 Tab 可接受；挑战是独立信息面，不挤进看板 |

## 4. 架构与改动面

- **`apps/api`**：新建 `challenges` 模块（service/controller/module）；`me` 模块加 `GET /me/challenges`；schema 加 `Challenge`（+迁移）。
- **`apps/web`**：`PoolDetailPage` 加「挑战」卡 + 新建弹窗；新增挑战详情页（进度 + 排行榜表）。
- **`apps/swimmer`**：新增「挑战」Tab 页（我的进行中挑战 + 我的名次）。
- **`packages/shared`**：挑战相关类型。
- 复用 Phase 1/2-A 的鉴权、所有权工具、前端模式、测试工具链、根脚本/CI（自动覆盖新模块/页面）。

## 5. 数据模型（新增）

```prisma
model Challenge {
  id                 String   @id @default(uuid())
  poolId             String
  pool               Pool     @relation(fields: [poolId], references: [id])
  name               String
  goalDistanceMeters Int
  startDate          DateTime
  endDate            DateTime
  createdAt          DateTime @default(now())

  @@index([poolId])
}
```
`Pool` 加 `challenges Challenge[]` 反向关系。需迁移 `add_challenge`。

## 6. 后端接口

所有 owner 接口 `@Roles(OWNER)` + 资源所有权校验；游泳者接口 `@Roles(SWIMMER)`。

| 方法 路径 | 角色 | 作用 |
|---|---|---|
| `POST /pools/:id/challenges` | OWNER | 建挑战（`CreateChallengeDto`：name/goalDistanceMeters/startDate/endDate） |
| `GET /pools/:id/challenges` | OWNER | 列本池挑战（含进度：窗口内池总里程、达成百分比） |
| `GET /challenges/:cid` | OWNER | 挑战详情 + 排行榜（窗口内按 swimmer 里程降序） |
| `DELETE /challenges/:cid` | OWNER | 删除挑战（硬删） |
| `GET /me/challenges` | SWIMMER | 我所属 ACTIVE 池的进行中挑战 + 我的里程/名次 + 池进度 |

### 6.1 类型（`@swim/shared`）
```ts
export interface CreateChallengeDto { name: string; goalDistanceMeters: number; startDate: string; endDate: string; }
export interface ChallengeSummary {
  id: string; poolId: string; name: string;
  goalDistanceMeters: number; startDate: string; endDate: string;
  totalDistanceMeters: number; // 窗口内池总里程
}
export interface LeaderboardRow { swimmerId: string; name: string | null; email: string; distanceMeters: number; }
export interface ChallengeDetail extends ChallengeSummary { leaderboard: LeaderboardRow[]; }
export interface MyChallengeItem {
  id: string; poolId: string; poolName: string; name: string;
  goalDistanceMeters: number; totalDistanceMeters: number;
  myDistanceMeters: number; myRank: number | null; // null = 我窗口内无记录
  startDate: string; endDate: string;
}
```

### 6.2 规则
- `CreateChallengeDto`：`@IsString name`、`@IsInt @Min(1) goalDistanceMeters`、`@IsDateString startDate/endDate`；service 校验 `endDate > startDate`（否则 400）。
- 进度/排行榜聚合：`SwimSession` where `poolId = challenge.poolId AND swamAt >= startDate AND swamAt < endDate`，`GROUP BY swimmerId SUM(distanceMeters)`，join `User` 取 name/email，降序。池总里程 = 各 swimmer 之和（或单独 SUM）。
- `assertOwnsChallenge(ownerId, cid)`：查 challenge→其 pool.ownerId===ownerId，违规 403 / 不存在 404。
- `GET /me/challenges`：取本人 ACTIVE 登记的 poolIds → 这些池里 `startDate <= now < endDate` 的挑战；对每个算池总里程 + 我的里程 + 我的名次（窗口内排行榜里我的位次）。

## 7. 前端

### 7.1 owner 控制台（apps/web）
- `PoolDetailPage` 加 `<ChallengesCard poolId>`：列挑战（名、`start–end`、进度条 `total/goal`）+「新建挑战」弹窗（`ChallengeForm`：名/目标/起止日期）。
- 新路由 `/pools/:poolId/challenges/:cid` → `ChallengeDetailPage`：进度概览 + 排行榜 `Table`（名次/姓名/里程）。
- query hooks：`usePoolChallenges`、`useCreateChallenge`、`useChallenge`、`useDeleteChallenge`（成功失效相关 key）。

### 7.2 游泳者端（apps/swimmer）
- TabBar 加第 4 项「挑战」→ `ChallengesPage`：`useMyChallenges` 列我的进行中挑战卡（池名、挑战名、进度条、我的里程 + 名次）；空态 CTA。

## 8. 错误处理
沿用既有：所有权 403、不存在 404、DTO/`endDate<=startDate` 400；前端 mutation/query 失败 toast，列表空态给文案。

## 9. 测试（TDD）
- **后端单测**（mock Prisma）：createChallenge（所有权 + endDate>startDate 校验）、challenge 进度/排行榜聚合（mock `$queryRaw` 验证映射与排序）、assertOwnsChallenge、myChallenges（窗口过滤 + 名次计算）。
- **后端 e2e**：owner 建挑战 → owner 代录 + 游泳者自录若干 → `GET /challenges/:cid` 排行榜顺序/里程正确、进度正确 → `GET /me/challenges` 我的名次正确 → 越权访问他人挑战 403。
- **前端**（两端 Vitest/RTL/MSW）：owner 新建挑战刷新、挑战详情排行榜渲染；游泳者挑战 Tab 渲染我的名次。

## 10. 实现顺序建议（供 writing-plans）
1. 数据模型 `Challenge` + 迁移。
2. 共享类型（§6.1）。
3. 后端 challenges 模块（建/列/详情+排行榜/删）+ `assertOwnsChallenge`，TDD。
4. 后端 `GET /me/challenges`，TDD。
5. 后端 e2e。
6. owner 控制台：挑战卡 + 新建弹窗 + 详情页。
7. 游泳者端：挑战 Tab。
8. 终验（全量门禁 + 实跑 + 对抗式评审）。
