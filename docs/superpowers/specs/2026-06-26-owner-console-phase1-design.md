# OWNER 管理控制台 · Phase 1（地基）设计

- **日期**：2026-06-26
- **分支**：refactor/pc
- **状态**：已确认，待转实现计划（writing-plans）

---

## 1. 背景与定位

现有仓库是一个 NestJS 模块化单体后端（Swim Marathon MVP），提供纯 REST/JSON
接口：`auth`、`pools`、`sessions`、`stats`、`places` 五个模块，数据层用 Prisma +
PostgreSQL/PostGIS。当前**没有任何前端**。

目标：为**泳池主（OWNER）**构建一个 PC 优先的 Web 管理控制台（响应式 SPA，
即 "H5 架构"），复用并扩展现有后端 API。

### 产品愿景（完整图景）

这是一个**会随赛事状态切换形态的控制台**：

- **无赛事时** → 默认进入「会员 + 场馆管理」形态（日常运营）
- **有赛事时** → 叠加「赛事 / 挑战组织」形态（发起挑战、目标、排行榜）
- **数据监控看板** → 横跨两种形态的常驻层

### 分期

愿景包含多个子系统，按依赖关系拆分，每期独立可交付、各走自己的
设计 → 计划 → 实现 循环：

| 期 | 范围 | 后端改动 |
|---|---|---|
| **Phase 1（本 spec）** | 地基 / 无赛事形态：账号外壳、泳池管理、会员管理、代录、基础监控看板 | 小：整理进 `src/` + 一批 owner 作用域接口 |
| Phase 2（未来另立 spec） | 赛事形态：`Event`/`Challenge`/排行榜 实体、挑战与目标、赛事看板、形态切换；游泳者移动端自助录入与账号认领 | 大：新建数据模型 |

**本 spec 只覆盖 Phase 1。**

---

## 2. 目标与非目标

### Phase 1 目标

- OWNER 能登录 / 自助注册。
- 多泳池运营：泳池总览（跨泳池汇总）→ 下钻单泳池 → 下钻游泳者。
- 泳池增 / 改 / 归档；会员新建 / 停用 / 恢复；owner 代录游泳记录。
- 基础监控看板：跨泳池、单泳池、单游泳者三层的里程 / 活跃 / 热力图。
- 前后端通过共享类型包端到端类型安全。

### 非目标（明确排除，避免范围膨胀）

- 赛事 / 挑战 / 排行榜（→ Phase 2）。
- 面向游泳者的端、游泳者自助登录与录入、账号认领流程（→ Phase 2）。
- 附近泳池地图（`/places`，偏游泳者场景）。
- CSV 导入导出、批量操作、消息通知。
- refresh token / token 轮换（沿用现有单 access token，Phase 2 再补）。
- Playwright E2E。

---

## 3. 关键决策记录

| # | 决策 | 取舍理由 |
|---|---|---|
| D1 | OWNER 通常管理**多个泳池**（连锁/多场馆） | IA 定为 总览→单泳池→游泳者 下钻，带泳池切换器与跨泳池汇总 |
| D2 | **OWNER 直接创建游泳者**（填 name+email） | Phase 1 是 owner 专用后台，owner 一手建会员最顺；现有 `register by UUID` 在真实界面不可用 |
| D3 | 新建会员**邮箱已存在 → 复用该用户并登记进本池**（INACTIVE 则恢复） | 不报错、不建重复账号；天然支撑"一个游泳者属于多个泳池" |
| D4 | 游泳者账号**随机占位密码** + `claimedAt=null` | Phase 1 游泳者不登录；owner/游泳者都不用管密码，Phase 2 认领时再设 |
| D5 | **增加 OWNER 代录**游泳记录 | Phase 1 无游泳者端，否则看板里程类数据为空；代录符合管理后台定位 |
| D6 | 泳池"删除"= **归档（软停用）** | 保留历史数据，避免误删 |
| D7 | 移除会员 = **Registration 置 INACTIVE** | 保留历史 session，可恢复 |
| D8 | 结构用 **npm workspaces monorepo**（`apps/api` + `apps/web` + `packages/shared`） | 后端本就必须重整；共享类型让接口改动在前端编译期暴露，省联调 |
| D9 | 前端栈 **React + Vite + Ant Design** | 管理后台生态最成熟；与 TS 后端同语言 |

---

## 4. 架构与仓库结构

```
swimmingtrace/
├─ package.json                 # workspaces 根 + 统一脚本（dev 同时起两端）
├─ apps/
│  ├─ api/                      # NestJS 后端
│  │  ├─ src/
│  │  │  ├─ main.ts  app.module.ts  prisma.service.ts
│  │  │  ├─ common/             # auth.common.ts（守卫/装饰器）
│  │  │  ├─ auth/               # + jwt.strategy.ts
│  │  │  ├─ pools/  sessions/  stats/
│  │  │  └─ places/             # 已存在，Phase 1 不动
│  │  └─ prisma/schema.prisma
│  └─ web/                      # React + Vite + AntD
│     └─ src/
│        ├─ app/                # 路由、Providers（QueryClient / Auth）
│        ├─ lib/                # axios 实例（拦截器）、query hooks、auth store
│        ├─ features/           # auth · pools · swimmers · sessions · dashboard
│        ├─ components/         # 通用 UI（AppLayout / PoolSwitcher / ProtectedRoute）
│        └─ routes/             # 路由定义
└─ packages/
   └─ shared/                   # 前后端共享 TS 类型（请求/响应/枚举）
```

**要点：**

1. **搬文件即修复编译**：现有文件平铺在根目录，但 import 路径（如
   `'../common/auth.common'`、`'./auth.service'`）本就指向 `src/` 子目录结构。
   按上表归位后，现有的编译错误自动消失——重整是必做的修复，而非额外成本。
2. **`packages/shared` 是架构价值核心**：定义所有"过 HTTP 的类型"（登录响应、
   泳池/会员 DTO、看板统计结构、`Role`/`RegistrationStatus` 枚举）。后端用于标注
   响应、前端用于标注 API 客户端；后端改接口形状 → 前端编译期立即报错。
   Prisma 内部类型仍留在后端，不外泄。
3. **开发期 Vite dev proxy**：`web` 把 `/api/*` 代理到 `localhost:3000`，本地不碰
   跨域；生产走 `VITE_API_BASE_URL` + 后端锁 CORS。

**运行前提（与设计正交）**：真正跑起来需带 **PostGIS** 的 Postgres（schema 声明了
postgis 扩展），Docker 或 brew 安装均可——实现阶段处理。Phase 1 的 stats 聚合本身
不依赖 PostGIS（仅 `/places` 用，已排除）。

---

## 5. 数据模型改动（最小）

| 模型 | 改动 | 说明 |
|---|---|---|
| `Pool` | 加 `archivedAt DateTime?` | 实现归档；列表默认过滤 `archivedAt = null` |
| `User` | 加 `claimedAt DateTime?` | owner 建的账号为 `null`；UI 显示"未认领"，为 Phase 2 认领铺路 |

`Registration.status`（已存在 `ACTIVE/INACTIVE`）用于会员停用/恢复，无需改。
`SwimSession` 字段已满足代录，无需改。

---

## 6. 后端扩展

所有新接口均 `@Roles(OWNER)`，并做**资源所有权校验**。

### 6.1 接口清单

| 方法 & 路径 | 作用 | 状态 |
|---|---|---|
| `POST /auth/register` / `POST /auth/login` / `GET /auth/me` | 注册/登录/当前用户 | 复用 |
| `GET /pools` | 列出我的泳池（默认非归档；`?includeArchived=true`） | NEW |
| `POST /pools` | 建泳池 | 复用 |
| `GET /pools/:id` | 泳池详情 | NEW |
| `PATCH /pools/:id` | 编辑泳池 | NEW |
| `POST /pools/:id/archive` | 归档（停用）泳池 | NEW |
| `GET /pools/:id/swimmers` | 本池会员名册 | 复用（按需补里程字段） |
| `POST /pools/:id/swimmers` | owner 建游泳者（name+email） | NEW |
| `PATCH /pools/:id/swimmers/:sid` | 停用/恢复会员（改 Registration 状态） | NEW |
| `POST /pools/:id/swimmers/:sid/sessions` | 代录一次游泳 | NEW |
| `GET /stats/overview` | 跨泳池汇总 | NEW |
| `GET /stats/pool/:id` | 单泳池聚合（里程趋势/活跃/热力图） | NEW |
| `GET /stats/swimmer/:sid` | 某游泳者汇总+热力图（owner 视角） | NEW |

> 现有 `GET /stats/summary`、`/stats/heatmap`、`POST /sessions`（按 `req.user.id`
> 自取/自录）保留给 Phase 2 游泳者自助使用，Phase 1 不经前端调用。

### 6.2 请求/响应形状（定义于 `packages/shared`）

```ts
// 枚举
type Role = 'ADMIN' | 'OWNER' | 'SWIMMER';
type RegistrationStatus = 'ACTIVE' | 'INACTIVE';

// auth
interface LoginResponse { accessToken: string; }
interface MeResponse { id: string; email: string; role: Role; }

// pools
interface CreatePoolDto { name: string; address?: string; latitude?: number; longitude?: number; }
interface UpdatePoolDto { name?: string; address?: string; latitude?: number; longitude?: number; }
interface PoolSummary {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  memberCount: number; mileageLast30dMeters: number;
  archivedAt: string | null; createdAt: string;
}

// swimmers / membership
interface CreateSwimmerDto { name?: string; email: string; }
interface SwimmerListItem {
  swimmerId: string; name: string | null; email: string;
  status: RegistrationStatus; claimedAt: string | null;
  mileageLast30dMeters: number; joinedAt: string;
}
interface UpdateMembershipDto { status: RegistrationStatus; }

// 代录
interface CreateSessionDto { distanceMeters: number; durationSeconds?: number; swamAt: string; } // ISO 8601

// stats
interface HeatmapCell { date: string; distanceMeters: number; } // YYYY-MM-DD
interface OverviewStats {
  poolCount: number; memberCount: number; activeMemberCount: number;
  mileageThisMonthMeters: number; sessionsThisMonth: number;
}
interface PoolStats {
  memberCount: number; activeMemberCount: number; mileageThisMonthMeters: number;
  trend: HeatmapCell[];   // 按日里程，用于趋势图
  heatmap: HeatmapCell[]; // 按日里程，用于日历热力图
}
interface SwimmerStats {
  summary: { totalDistanceMeters: number; totalDurationSeconds: number; sessionCount: number; };
  heatmap: HeatmapCell[];
}
```

### 6.3 所有权校验策略

沿用现有"在 service 里显式判断 `pool.ownerId !== ownerId`"的风格，抽两个复用工具：

- `assertOwnsPool(ownerId, poolId)` — 泳池归属，违规抛 `ForbiddenException`(403)。
- `assertOwnsSwimmer(ownerId, swimmerId)` — 校验该游泳者属于"我名下某泳池"
  （查 Registration 关联），违规 403。

角色门禁仍由现有 `RolesGuard` + `@Roles(OWNER)` 承担；资源级所有权由上述工具在
service 层兜。两者职责分离。

### 6.4 "建游泳者"规则

1. **密码**：后端生成随机字符串 → bcrypt 哈希；`claimedAt = null`。
2. **邮箱已存在**：查到同邮箱用户 → 不建新账号，直接 `upsert` 一条指向本池的
   Registration（不存在则建 ACTIVE，INACTIVE 则恢复为 ACTIVE）。返回该游泳者。

---

## 7. 前端架构

### 7.1 路由与 IA

| 路由 | 页面 | 守卫 |
|---|---|---|
| `/login` | 登录 / 注册为 OWNER | 公开 |
| `/` | 重定向到 `/pools` | — |
| `/pools` | 泳池总览：跨泳池汇总卡 + 泳池列表 + 新建泳池 | 登录 + OWNER |
| `/pools/:poolId` | 单泳池详情：信息+编辑、会员名册、本池看板 | 登录 + OWNER + 拥有该池 |
| `/pools/:poolId/swimmers/:sid` | 游泳者详情：资料、汇总、热力图、代录 | 同上 |

看板不单独建页，分别嵌入总览 / 单泳池 / 游泳者三层。

### 7.2 应用外壳

AntD `Layout`：左侧导航 + 顶栏（**泳池切换器** → 跳 `/pools/:id`、用户菜单/登出）+
内容区。`ProtectedRoute` 统一处理"未登录跳 `/login`、非 OWNER 拦截"。

### 7.3 鉴权与 token

- `useAuthStore`（Zustand）存 `{ token, user }`，持久化到 `localStorage`（刷新不掉登录）。
- 启动时若有 token → 调 `GET /auth/me` 校验并取回 `user/role`，失败则清空。
- **无 refresh token、token 1 天过期** → 拦截器遇 401 统一清登录态 + 跳 `/login`。

### 7.4 API 客户端 & 数据层

- **axios 实例**：`baseURL='/api'`（开发走 Vite proxy）；请求拦截器注入
  `Authorization: Bearer`，响应拦截器处理 401 跳转 + AntD `message` 弹错。
- **TanStack Query** 管所有服务端数据；按资源建 query key；新建泳池/建会员/代录/
  归档/改状态用 mutation，成功后 invalidate 相关查询自动刷新。
- **Zustand 仅管 auth**，其余皆服务端状态，不引入 Redux。
- 请求/响应类型一律来自 `packages/shared`。

### 7.5 关键库

| 用途 | 选型 |
|---|---|
| 表格/表单/布局 | Ant Design |
| 热力图 | `@uiw/react-heat-map`（吃 `HeatmapCell[]`） |
| 趋势/活跃图 | Recharts |

### 7.6 目录结构

```
web/src/
├─ app/         # router、providers（QueryClient / AntD ConfigProvider / 启动鉴权）
├─ lib/         # api（axios + 强类型端点函数）、query hooks、auth store
├─ features/
│  ├─ auth/         # 登录页
│  ├─ pools/        # 总览页、详情页、泳池表单
│  ├─ swimmers/     # 名册表、建会员弹窗、游泳者详情页
│  ├─ sessions/     # 代录弹窗
│  └─ dashboard/    # 汇总卡、单泳池看板、热力图、趋势图
├─ components/   # AppLayout、PoolSwitcher、ProtectedRoute、ErrorBoundary
└─ routes/       # 路由定义
```

---

## 8. 错误处理

### 后端（沿用现有 NestJS 模式）

- 校验：新 DTO（`CreateSwimmerDto`/`CreateSessionDto`/`UpdatePoolDto`）用
  class-validator，`ValidationPipe` → `400` + 字段错误。
- 状态码：所有权违规 `403`、资源不存在 `404`、未登录/过期 `401`；错误体沿用
  NestJS 默认 `{ statusCode, message, error }`。

### 前端（三层兜底）

- **全局**：响应拦截器 → `401` 清登录态+跳 `/login`；其余 4xx/5xx →
  AntD `message.error(服务端 message)`。
- **表单级**：AntD Form 校验镜像后端 DTO 约束；mutation `onError` 弹 toast。
- **页面级**：查询 loading 用 Skeleton/Spin；空态给 CTA（无泳池 → "新建第一个泳池"）；
  `ErrorBoundary` 兜渲染错误。

---

## 9. 测试策略（MVP 适度）

实现阶段采用 TDD（先测后码）。

### 后端（Jest）

- **单测**压在最高风险代码：`assertOwnsPool/assertOwnsSwimmer`（所有权）、
  `createSwimmer`（邮箱已存在→复用、随机密码）、代录（会员归属校验）——mock Prisma。
- **少量 e2e**（supertest + 测试库）：关键鉴权/所有权链路——"owner 碰别人泳池得
  403"、建会员 happy path、代录 happy path。
- **stats 原生 SQL** 走集成测试打真实 Postgres（不需要 PostGIS）。

### 前端（Vitest + React Testing Library + MSW）

- 覆盖关键流：登录→重定向、新建泳池、建会员、代录弹窗、`ProtectedRoute` 角色拦截。
- 不上 Playwright E2E（YAGNI）。

---

## 10. 实现顺序建议（供 writing-plans 参考）

1. **Monorepo 重整**：建 workspaces，后端文件归位进 `apps/api/src/`，确认编译通过。
2. **`packages/shared`**：落地第 6.2 节类型。
3. **后端数据模型**：加 `Pool.archivedAt`、`User.claimedAt`，迁移。
4. **后端接口 + 所有权工具**：按第 6 节逐个实现，配单测/e2e。
5. **前端脚手架**：Vite+React+AntD、路由、axios 拦截器、auth store、登录页。
6. **前端页面**：总览 → 单泳池（名册+建会员+代录）→ 游泳者详情 → 各层看板。
7. **联调与测试补全**。
