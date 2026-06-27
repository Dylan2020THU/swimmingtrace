# 🏊 SwimmingTrace — 泳池主（OWNER）管理控制台

[![CI](https://github.com/Dylan2020THU/swimmingtrace-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/Dylan2020THU/swimmingtrace-v2/actions/workflows/ci.yml)

一个面向**泳池主（OWNER）**的 PC 优先 Web 管理控制台：管理多个泳池与会员、为会员**代录**游泳记录，并通过三层（跨泳池 / 单泳池 / 单游泳者）监控看板查看里程、活跃度与 GitHub 风格的日历热力图。

> 这是 **Phase 1（地基 / 无赛事形态）**。权威产品设计见
> [`docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md`](docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md)。

---

## 技术栈

| 层 | 选型 |
|---|---|
| **前端** `apps/web` | React 18 · Vite 5 · TypeScript 5 · Ant Design 5 · TanStack Query 5 · Zustand 4 · React Router 6 · Axios · Recharts · `@uiw/react-heat-map` · dayjs |
| **后端** `apps/api` | NestJS 10 · Prisma 5 · PostgreSQL + PostGIS · Passport-JWT · bcrypt · class-validator · `@nestjs/throttler` |
| **共享** `packages/shared` | 纯 TypeScript 类型包（前后端共享所有"过 HTTP 的类型"） |
| **测试** | 后端 Jest（单测 + supertest e2e）；前端 Vitest + Testing Library + MSW |
| **工程** | npm workspaces 单体仓库 · ESLint + Prettier · GitHub Actions CI |

## 仓库结构

```
swimmingtrace/
├─ apps/
│  ├─ api/                 # NestJS 后端
│  │  ├─ src/{auth,pools,sessions,stats,places,me,common}/
│  │  ├─ prisma/           # schema.prisma · migrations/ · seed.ts
│  │  └─ test/             # e2e（supertest）+ 测试库夹具
│  ├─ web/                 # 泳池主控制台（React + Vite + AntD，PC 优先，:5173）
│  └─ swimmer/             # 游泳者移动端（React + Vite + antd-mobile，:5174）
├─ packages/
│  └─ shared/              # @swim/shared — 前后端共享类型 / DTO
└─ docs/superpowers/       # 设计 spec 与实现计划
```

## 环境要求

- **Node ≥ 20**（见 `.nvmrc`）
- **Docker**（用于一键起带 PostGIS 的 PostgreSQL；也可自备本地 PostGIS 实例）

## 快速开始

```bash
# 1) 准备后端环境变量（默认值开箱即可本地运行）
cp apps/api/.env.example apps/api/.env
#   生产环境务必把 JWT_SECRET 换成强随机串（否则不应上线）：
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2) 一键安装 + 起库 + 迁移 + 种子
npm run setup

# 3) 同时启动后端(:3000) + owner 控制台(:5173) + 游泳者端(:5174)
npm run dev
```

打开 http://localhost:5173 （owner 控制台），用种子账号登录：

| 账号 | 密码 |
|---|---|
| `owner@swim.dev` | `password123` |

> 种子会建好 1 个 OWNER、3 个泳池（含 1 个已归档）、5 名游泳者（含 1 名已停用）以及跨约 120 天的 ~270 条游泳记录，便于直接观察看板与热力图。

### 常用脚本（根目录）

| 命令 | 作用 |
|---|---|
| `npm run setup` | 安装依赖 → 起库 → 迁移 → 种子（一键） |
| `npm run dev` | 并行启动 api + web |
| `npm run build` | 构建 shared + api + web |
| `npm test` | 单测（api + web） |
| `npm run test:e2e` | e2e（自动建隔离 `swim_test` 库并迁移） |
| `npm run lint` | ESLint（api + web） |
| `npm run db:up` / `db:down` | 起 / 停 PostGIS 容器 |
| `npm run db:migrate` / `db:seed` | 迁移 / 灌种子 |
| `npm run prod:up` / `prod:down` | 生产 compose：构建并起 api+postgis / 停（见「生产部署与运维」）|

## 接口一览（OWNER 控制台）

所有非 auth 接口需 `Authorization: Bearer <token>` 且角色为 `OWNER`，并在 service 层做资源所有权校验。

| 方法 路径 | 作用 |
|---|---|
| `POST /auth/register` · `POST /auth/login` · `GET /auth/me` | 注册（OWNER）/ 登录 / 当前用户 |
| `GET /pools?includeArchived=` · `POST /pools` | 列出 / 新建泳池 |
| `GET /pools/:id` · `PATCH /pools/:id` · `POST /pools/:id/archive` | 详情 / 编辑 / 归档（软删） |
| `GET /pools/:id/swimmers` · `POST /pools/:id/swimmers` | 名册 / 新建会员（邮箱已存在则复用） |
| `PATCH /pools/:id/swimmers/:sid` | 停用 / 恢复会员 |
| `POST /pools/:id/swimmers/:sid/sessions` | **代录**一次游泳 |
| `GET /stats/overview` · `GET /stats/pool/:id` · `GET /stats/swimmer/:sid` | 跨泳池 / 单泳池 / 单游泳者看板 |
| `GET /health` · `GET /health/ready` | 存活 / 就绪探针（**公开**、免鉴权免限流）|

## 架构要点

- **共享类型契约**：所有请求/响应类型定义在 `@swim/shared`；后端响应与前端 API 客户端共用，后端改接口形状会在前端**编译期**立即暴露。
- **开发期代理**：前端 axios `baseURL='/api'`，Vite dev proxy 把 `/api/*` 转发到 `localhost:3000` 并剥离 `/api` 前缀；生产通过 `CORS_ORIGIN` 白名单放行前端源。
- **鉴权**：单 access token（JWT，默认 1 天）；`JwtAuthGuard` + `RolesGuard` 做角色门禁，`assertOwnsPool/Swimmer` 做资源级所有权。启动时校验 `JWT_SECRET`（缺失/占位/过短即 fail-fast）。
- **限流**：全局 100/60s 基线，`/auth/login`、`/auth/register` 收紧到 5/60s。
- **看板热力图**：按 `APP_TIMEZONE`（默认 UTC）在 SQL 内按日聚合并格式化为 `YYYY-MM-DD`。

## 测试

```bash
npm test          # api 单测（mock Prisma）+ web（Vitest + MSW）
npm run test:e2e  # api e2e —— globalSetup 自动建隔离的 swim_test 库并 migrate deploy
```

e2e 覆盖关键鉴权/所有权链路（owner 越权 → 403）与"建会员 + 代录 + 看板数据"happy path，并断言真实库上的 stats 原生 SQL。

## 游泳者端与账号认领（apps/swimmer）— Phase 2-A

移动优先的游泳者端（:5174，antd-mobile）。owner 建的游泳者账号通过**一次性认领链接**激活：

1. owner 在控制台名册点「生成认领链接」→ 拿到 `${SWIMMER_APP_URL}/claim/<token>`（默认 7 天有效）。
2. 手动分发给游泳者（微信/短信等）。
3. 游泳者打开链接 → 设密码认领 → 自动登录 → 在游泳者端**选所属泳池自助录入**、看个人热力图/汇总与历史。

自录数据按 `poolId` 进入 owner 的单泳池看板（录入时校验本人在该池 ACTIVE 登记）。设计见
[`docs/superpowers/specs/2026-06-27-swimmer-self-service-claim-design.md`](docs/superpowers/specs/2026-06-27-swimmer-self-service-claim-design.md)。

**游泳者端接口**：`GET /auth/claim/:token`、`POST /auth/claim`（公开，限流）；`GET /me/pools`、`POST /sessions`、`GET /sessions/me`、`GET /stats/summary`、`GET /stats/heatmap`（`@Roles(SWIMMER)`）。owner 侧 `POST /pools/:id/swimmers/:sid/claim-link`。

## 挑战与排行榜（Phase 2-B）

owner 可在泳池下发起**带目标的挑战**（名称、目标里程、起止日期），系统基于既有游泳记录（含游泳者自录）实时算出**进度**与**个人排行榜**：

- owner：单泳池详情「挑战」卡 → 新建挑战 / 进入挑战详情（进度 + 排行榜）。
- 游泳者：移动端「挑战」Tab → 我所属池的进行中挑战、池进度、我的里程与名次。

进度 = 窗口内全池总里程 vs 目标；排行榜 = 窗口内按游泳者聚合里程降序。设计见
[`docs/superpowers/specs/2026-06-27-challenges-leaderboard-design.md`](docs/superpowers/specs/2026-06-27-challenges-leaderboard-design.md)。

**挑战接口**：owner `POST`/`GET /pools/:id/challenges`、`GET`/`DELETE /challenges/:cid`、`GET /challenges/active`（`@Roles(OWNER)`）；游泳者 `GET /me/challenges`（`@Roles(SWIMMER)`）。

**形态切换（Phase 2-C）**：owner 控制台**随赛事状态自适应**——任一未归档泳池有进行中挑战时自动进入「赛事形态」：总览页顶部出现跨泳池「进行中的挑战」区、顶栏显示「赛事进行中」徽标、单泳池详情把挑战卡上提到顶部；无进行中挑战则回落日常运营形态。由 `GET /challenges/active` 驱动，纯呈现层、无手动开关。设计见 [`docs/superpowers/specs/2026-06-27-morph-switching-design.md`](docs/superpowers/specs/2026-06-27-morph-switching-design.md)。

**附近泳池（Phase 2-D）**：游泳者端「我的」→「附近泳池」——浏览器定位（拒绝则手填经纬度）→ 复用 `GET /places/nearby`（PostGIS 半径搜索）列出附近泳池（名称/地址/距离）。只读发现，不含自助加入。设计见 [`docs/superpowers/specs/2026-06-27-nearby-pools-design.md`](docs/superpowers/specs/2026-06-27-nearby-pools-design.md)。

## 仍预留的 Phase 2 面（非死代码）

- `POST /pools/:id/register`（按 UUID 自助加入泳池的旧路径，已被认领流程取代，暂留）
- 赛事容器/报名、游泳者自助加入泳池、refresh token —— 见设计文档，各自另立子项目。

## 生产部署与运维

后端已具备商业 SaaS 的平台基线。设计见 [`docs/superpowers/specs/2026-06-27-prod-hardening-observability-design.md`](docs/superpowers/specs/2026-06-27-prod-hardening-observability-design.md)。

### 容器化部署

```bash
# 根目录放一个 .env（compose 自动读取），至少含强随机 JWT_SECRET：
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(32).toString('hex'))" > .env

npm run prod:up      # 构建 API 镜像并起 api + postgis（api 启动时自动 prisma migrate deploy）
npm run prod:down    # 停止并清理
```

- `apps/api/Dockerfile`：多阶段构建，运行期**非 root**；entrypoint 先 `prisma migrate deploy` 再起服务。
- `docker-compose.prod.yml`：`api`（:3000）+ `db`（PostGIS，命名卷持久化 + healthcheck）。前端为独立静态产物（CDN/静态托管），不在本 compose 内。
- `prod:down` 同样需要 `JWT_SECRET`（compose 对必填变量做插值校验），放在根 `.env` 即可。

### 健康探针

| 路径 | 用途 |
|---|---|
| `GET /health` | 存活：进程在即 200（不碰库）|
| `GET /health/ready` | 就绪：探 DB（`SELECT 1`），200 / 503 |

二者公开、免鉴权、免限流，供编排器 / 负载均衡使用。

### 配置 fail-fast

启动时校验环境变量，非法即拒绝启动：`JWT_SECRET`（必填、≥16、非占位 `change-me-in-prod`）、`DATABASE_URL`（必填）、`NODE_ENV` / `LOG_LEVEL`（枚举）、`PORT`（数字）；`CORS_ORIGIN` / `SWIMMER_APP_URL` / `APP_TIMEZONE` 缺省回填。

### 可观测与排错

- **结构化日志**：`nestjs-pino`——生产输出 JSON、开发 pretty；`LOG_LEVEL` 可调；`Authorization` / `Cookie` 自动脱敏；`/health*` 降为 debug 避免刷屏。
- **请求关联**：每个请求带 `x-request-id`（回显入站值或生成），贯穿日志行、错误信封与响应头——排错时用它串起一次请求的全部日志。
- **统一错误信封**：所有错误返回 `{ statusCode, error, message, requestId, timestamp, path }`（类型见 `@swim/shared` 的 `ApiErrorResponse`）；5xx 堆栈只进日志、不进响应体。
- **安全头 / 压缩**：`helmet` + `compression`。**优雅关闭**：`SIGTERM/SIGINT` → Prisma 断连。

## 文档

- 设计：[`docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md`](docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md) · [生产加固与可观测性](docs/superpowers/specs/2026-06-27-prod-hardening-observability-design.md)
- 实现计划：[`docs/superpowers/plans/`](docs/superpowers/plans/)
