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
│  │  ├─ src/{auth,pools,sessions,stats,places,common}/
│  │  ├─ prisma/           # schema.prisma · migrations/ · seed.ts
│  │  └─ test/             # e2e（supertest）+ 测试库夹具
│  └─ web/                 # React + Vite + AntD 控制台
│     └─ src/{app,lib,features,components}/
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

# 3) 同时启动后端(:3000) 与前端(:5173)
npm run dev
```

打开 http://localhost:5173 ，用种子账号登录：

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

## Phase 2 的预留面（**有意保留，非死代码**）

为后续"游泳者自助端"预留、当前 OWNER 控制台**不经前端调用**的后端接口：

- `POST /pools/:id/register`（游泳者自助加入泳池，`@Roles(OWNER, SWIMMER)`）
- `POST /sessions`、`GET /sessions/me`（游泳者自录自取）
- `GET /stats/heatmap`、`GET /stats/summary`（游泳者自视角，`@Roles(SWIMMER)`）
- `GET /places/nearby`（PostGIS 附近泳池）
- `User.claimedAt`（账号认领占位；UI 显示"未认领"）

Phase 2 范围（赛事 / 挑战 / 排行榜、游泳者移动端与账号认领、refresh token 等）见设计文档，不在本期。

## 文档

- 设计：[`docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md`](docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md)
- 实现计划：[`docs/superpowers/plans/`](docs/superpowers/plans/)
