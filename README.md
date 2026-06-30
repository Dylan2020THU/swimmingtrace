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
| `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/logout-all` | 轮换刷新令牌 / 登出（撤当前会话）/ 全登出（撤全部会话）|
| `POST /auth/forgot-password` · `POST /auth/reset-password` | 忘记密码（发重置邮件，**无枚举**）/ 重置密码（改密 + 撤全部会话）|
| `POST /auth/verify-email` · `POST /auth/resend-verification` | 验证邮箱 / 重发验证邮件（**软门禁**）|
| `GET /pools?includeArchived=` · `POST /pools` | 列出 / 新建泳池 |
| `GET /pools/:id` · `PATCH /pools/:id` · `POST /pools/:id/archive` | 详情 / 编辑 / 归档（软删） |
| `GET /pools/:id/swimmers` · `POST /pools/:id/swimmers` | 名册（**分页**：`?page=&pageSize=`，返回 `{items,total,page,pageSize}`）/ 新建会员（邮箱已存在则复用） |
| `PATCH /pools/:id/swimmers/:sid` | 停用 / 恢复会员 |
| `POST /pools/:id/swimmers/:sid/sessions` | **代录**一次游泳 |
| `GET /stats/overview` · `GET /stats/pool/:id` · `GET /stats/swimmer/:sid` | 跨泳池 / 单泳池 / 单游泳者看板 |
| `GET·POST /meets` · `GET·DELETE /meets/:id` | 赛事列表 / 新建（Pro）/ 详情（含项目）/ 删除 |
| `POST /meets/:id/events` · `DELETE /events/:eid` | 加 / 删比赛项目（距离 + 泳姿） |
| `POST·GET /events/:eid/entries` · `DELETE /entries/:enid` · `PATCH /entries/:enid/result` | 报名 / 列表 / 退赛 / 录成绩 |
| `GET /events/:eid/standings` | 排行榜（按 性别 × 年龄组 名次 + 金银铜） |
| `POST /meets/:id/publish` · `POST /meets/:id/registration` | 公开发布开关 / 开放报名开关（owner） |
| `GET /public/meets/:id` · `/public/events/:eid/startlist·results` | **免登录** PII 安全投影（仅已发布赛事，否则 `404`） |
| `GET /me/meets` · `POST /me/meets/events/:eid/entries` · `DELETE /me/meets/entries/:enid` | 游泳者：开放赛事列表 / 自助报名 / 撤回（`@Roles(SWIMMER)`） |
| `PATCH /me/profile` · `GET /me/records` | 游泳者补全 性别/出生日期 / 我的 PB（含赛会纪录标注） |
| `POST·GET /seasons` · `GET·DELETE /seasons/:id` · `POST /seasons/:id/publish` | 赛季列表/新建（Pro）/详情(含积分榜)/删除/公开（owner） |
| `POST /meets/:id/season` · `GET /records` | 赛事归入赛季 / 俱乐部赛会纪录板（owner） |
| `GET /public/seasons/:id` · `/public/seasons/:id/records` | **免登录** 赛季积分榜 / 纪录板（PII 安全，仅已发布） |
| `GET /account/plan` · `POST /account/plan` | 当前计划（用量/上限/功能）/ 自助升级降级（Free↔Pro，无支付） |
| `POST /api-keys` · `GET /api-keys` · `DELETE /api-keys/:id` | 新建（Pro，返回明文一次）/ 列出（不含密钥）/ 撤销 API key |
| `GET /account/export` · `DELETE /account` | 导出本账号全部数据（JSON）/ 密码确认删除账号及名下全部数据 |
| `GET /health` · `GET /health/ready` | 存活 / 就绪探针（**公开**、免鉴权免限流）|
| `GET /metrics` | Prometheus 指标（**公开**、免限流；生产用网络策略限制）|

## 架构要点

- **共享类型契约**：所有请求/响应类型定义在 `@swim/shared`；后端响应与前端 API 客户端共用，后端改接口形状会在前端**编译期**立即暴露。
- **开发期代理**：前端 axios `baseURL='/api'`，Vite dev proxy 把 `/api/*` 转发到 `localhost:3000` 并剥离 `/api` 前缀；生产通过 `CORS_ORIGIN` 白名单放行前端源。
- **前端韧性**：两端均有 `ErrorBoundary`（渲染异常显示友好兜底 + 刷新，而非白屏）；`QueryClient` 统一 `QueryCache.onError`，数据拉取失败弹出可读提示（web `message`、swimmer `Toast`），不再静默——mutation 仍保留各自就地错误处理。
- **鉴权**：短寿命 **access**（JWT，默认 15m）+ 旋转 **refresh**（不透明 256-bit、sha256 哈希存库、默认 30d 滑动、每次 `/auth/refresh` 轮换、**复用即撤族**）；两端 axios 在 401 时**单飞续期**并重试，对用户无感。登出/全登出服务端真撤销。**忘记/重置密码**：邮件链接（无枚举）、令牌哈希单用、重置即撤销全部会话。**邮箱验证**：OWNER 注册发验证信、`emailVerifiedAt` 记录、**软门禁**（未验证仍可登录，控制台横幅 + 重发）；认领游泳者认领时自动已验证。`JwtAuthGuard` + `RolesGuard` 做角色门禁，`assertOwnsPool/Swimmer` 做资源级所有权。启动时校验 `JWT_SECRET`（缺失/占位/过短即 fail-fast）。
- **限流**：全局 100/60s 基线，`/auth/login`、`/auth/register` 收紧到 5/60s。
- **幂等键**：认证的**创建型 POST** 可带 `Idempotency-Key` 头安全重放——首次执行落库（状态码 + 响应体，按 `userId` 作用域），同 key 重放直接返回原响应（不重复副作用），同 key 异载荷 → `422`，并发/进行中同 key → `409`，handler 失败则释放 key 允许重试。全局 `IdempotencyInterceptor` 实现；两端 session 自录/代录请求已自动携带该头（弱网/单飞续期重发不会把一次游泳记成两次）。
- **看板热力图**：按 `APP_TIMEZONE`（默认 UTC）在 SQL 内按日聚合并格式化为 `YYYY-MM-DD`。
- **数据与合规**：owner 自助**数据导出**（`GET /account/export` → 账号 + 名下泳池/会员/记录/挑战 的完整 JSON）与**账号删除**（`DELETE /account`，密码二次确认 → 事务级联删名下全部业务数据与账号；refresh/idempotency 经 FK 级联清除）。会员是独立账号，owner 删除仅移除其在本租户池的数据，不删其账号。控制台「账号与数据」页提供入口。
- **计划与计费**：Owner 即租户，订阅 **Free / Pro** 两档（限额写代码配置 `PLAN_LIMITS`）。服务端强制**配额**（Free：1 泳池 / 25 会员）与**功能门禁**（数据导出、挑战赛、API Keys 为 Pro）；超限/无权返回 **HTTP 402** + 可读 message。owner 在控制台「账号与数据 › 计划」**自助升降级**（`POST /account/plan`，翻计划即生效——真支付为未来 seam）。降级**祖父化**：既有数据保留，低于上限前不能新建。
- **API Keys（程序化访问）**：owner 可建长寿命密钥（Pro 功能），脚本携 `Authorization: Bearer swk_…` 即免交互调用其 owner 端点（**充当 owner**，与其 JWT 同权）。密钥**只存 sha256 哈希**、明文仅创建时返回一次；`JwtAuthGuard` 见 `swk_` 前缀走密钥校验、否则走 JWT；记录 `lastUsedAt`；撤销即删行立即失效。密钥走 `Authorization` 头 → 已被日志脱敏。

## API 文档

后端启动后，OpenAPI 文档在线可用：

- **`GET /docs`** —— Swagger UI（可浏览全部端点、按标签分组、在线调试）。
- **`GET /docs-json`** —— 原始 OpenAPI JSON（可喂给客户端生成器/Postman）。

含 Bearer 鉴权声明与统一错误信封（`ApiErrorResponse`）schema。生产可置 `SWAGGER_ENABLED=false` 关闭。

## 测试

```bash
npm test          # api 单测（mock Prisma）+ web（Vitest + MSW）
npm run test:e2e  # api e2e —— globalSetup 自动建隔离的 swim_test 库并 migrate deploy
```

e2e 覆盖关键鉴权/所有权链路（owner 越权 → 403）与"建会员 + 代录 + 看板数据"happy path，并断言真实库上的 stats 原生 SQL。

## 游泳者端与账号认领（apps/swimmer）— Phase 2-A

移动优先的游泳者端（:5174，antd-mobile）。owner 建的游泳者账号通过**一次性认领链接**激活：

1. owner 在控制台名册点「生成认领链接」→ 系统**自动把链接邮件发到该游泳者邮箱**（尽力而为；同时返回 `${SWIMMER_APP_URL}/claim/<token>`，默认 7 天有效，供手动复制兜底）。
2. 游泳者收邮件（或 owner 手动经微信/短信分发）。
3. 游泳者打开链接 → 设密码认领 → 自动登录 → 在游泳者端**选所属泳池自助录入**、看个人热力图/汇总与历史。

自录数据按 `poolId` 进入 owner 的单泳池看板（录入时校验本人在该池 ACTIVE 登记）。设计见
[`docs/superpowers/specs/2026-06-27-swimmer-self-service-claim-design.md`](docs/superpowers/specs/2026-06-27-swimmer-self-service-claim-design.md)。

**游泳者端接口**：`GET /auth/claim/:token`、`POST /auth/claim`（公开，限流）；`GET /me/pools`、`POST /sessions`、`GET /sessions/me`（**分页** `?page=&pageSize=`，返回 `{items,total,page,pageSize}`）、`GET /stats/summary`、`GET /stats/heatmap`（`@Roles(SWIMMER)`）。owner 侧 `POST /pools/:id/swimmers/:sid/claim-link`。

## 挑战与排行榜（Phase 2-B）

owner 可在泳池下发起**带目标的挑战**（名称、目标里程、起止日期），系统基于既有游泳记录（含游泳者自录）实时算出**进度**与**个人排行榜**：

- owner：单泳池详情「挑战」卡 → 新建挑战 / 进入挑战详情（进度 + 排行榜）。
- 游泳者：移动端「挑战」Tab → 我所属池的进行中挑战、池进度、我的里程与名次。

进度 = 窗口内全池总里程 vs 目标；排行榜 = 窗口内按游泳者聚合里程降序。设计见
[`docs/superpowers/specs/2026-06-27-challenges-leaderboard-design.md`](docs/superpowers/specs/2026-06-27-challenges-leaderboard-design.md)。

**挑战接口**：owner `POST`/`GET /pools/:id/challenges`、`GET`/`DELETE /challenges/:cid`、`GET /challenges/active`（`@Roles(OWNER)`）；游泳者 `GET /me/challenges`（`@Roles(SWIMMER)`）。

**形态切换（Phase 2-C）**：owner 控制台**随赛事状态自适应**——任一未归档泳池有进行中挑战时自动进入「赛事形态」：总览页顶部出现跨泳池「进行中的挑战」区、顶栏显示「赛事进行中」徽标、单泳池详情把挑战卡上提到顶部；无进行中挑战则回落日常运营形态。由 `GET /challenges/active` 驱动，纯呈现层、无手动开关。设计见 [`docs/superpowers/specs/2026-06-27-morph-switching-design.md`](docs/superpowers/specs/2026-06-27-morph-switching-design.md)。

**附近泳池（Phase 2-D）**：游泳者端「我的」→「附近泳池」——浏览器定位（拒绝则手填经纬度）→ 复用 `GET /places/nearby`（PostGIS 半径搜索）列出附近泳池（名称/地址/距离）。只读发现，不含自助加入。设计见 [`docs/superpowers/specs/2026-06-27-nearby-pools-design.md`](docs/superpowers/specs/2026-06-27-nearby-pools-design.md)。

## 赛事平台（E1 赛事核心）

区别于「挑战赛」（集体里程目标）：这是带**计时成绩与名次**的正式赛事。owner 在控制台**顶层「赛事」菜单**办赛：

1. **赛事**（名称 / 日期 / 主办泳池）→ 2. **比赛项目**（距离 + 泳姿，如 50m 自由泳）→ 3. **报名**（名下任意泳池的会员；会员需先在名册补 **性别 + 出生日期**，否则报名返回 `422`）→ 4. **录成绩**（完赛时间 `m:ss.SS` / DNS / DNF / DQ）→ 5. **自动名次 + 奖牌**。

排名**按 (性别 × 年龄组) 分组**（标准年龄组：10及以下 / 11-12 / 13-14 / 15-17 / 18及以上，按赛事日期计龄）：组内 `OK` 完赛者按时间升序、并列同名次、每组前三发**金/银/铜**；DNS/DNF/DQ 不计名次。成绩存毫秒整数（`parse/formatSwimTime`）。创建赛事为 **Pro 功能**（Free → `402`）。名次/年龄组为纯函数，重点单测覆盖。设计见 [`docs/superpowers/specs/2026-06-30-meets-e1-design.md`](docs/superpowers/specs/2026-06-30-meets-e1-design.md)。

**E2 分组泳道**：对某项目一键「**排道**」——按种子成绩 `seedTimeMs` **冠军式**编排到分组(heats)与泳道(lanes)：最快者进**最后一组**、组内**中心向外**分道（6 道 `3,4,2,5,1,6`），无种子成绩者视为最慢；产出按 heat 分组的**出发名单**。泳道数记在赛事上（`laneCount`，默认 6）。`POST /events/:eid/seed` 落库 `MeetEntry.heat/lane`。排道为纯函数，重点单测。设计见 [`docs/superpowers/specs/2026-06-30-meets-e2-seeding-design.md`](docs/superpowers/specs/2026-06-30-meets-e2-seeding-design.md)。

**E3 公开赛事页**：owner 把赛事**发布**（`Meet.published`）后，任何人凭链接 `/p/meets/:id`（web 内、ProtectedRoute 之外的免登录路由）查看**赛程 / 出发名单 / 成绩名次**。公开端点（`GET /public/meets/:id`、`/public/events/:eid/startlist`、`/public/events/:eid/results`）**无鉴权**但走**专用 PII 安全投影**：只露 姓名 + 道次/种子成绩 + 年龄组/名次/成绩，**绝不含邮箱/出生日期/owner 信息**；未发布一律 `404`。owner 在赛事详情用「公开」开关切换 + 复制链接。设计见 [`docs/superpowers/specs/2026-06-30-meets-e3-public-design.md`](docs/superpowers/specs/2026-06-30-meets-e3-public-design.md)。

**E4 自助报名**：owner 用赛事详情的「**开放报名**」开关（`Meet.registrationOpen`，`POST /meets/:id/registration`）放开某赛事后，**会员可在游泳者端自助报名**——移动端新增**「赛事」Tab**：列出*自己所属泳池的主办方*已开放的赛事，逐项目「报名 / 撤回」，报名可选填种子成绩（`m:ss.SS`）。游泳者首次报名前需在**「完善资料」弹窗**补 **性别 + 出生日期**（`PATCH /me/profile`），否则报名返回 `422`。报名/撤回接口 `@Roles(SWIMMER)`：`GET /me/meets`、`POST /me/meets/events/:eid/entries`、`DELETE /me/meets/entries/:enid`。**安全边界**：自助报名严格限定为「**主办方名下泳池的 `ACTIVE` 会员**」（否则 `403`），重复报名 `409`；撤回**仅限本人**条目（否则 `403`）且**仅在出成绩前**（已有成绩 `409`）。设计见 [`docs/superpowers/specs/2026-06-30-meets-e4-selfreg-design.md`](docs/superpowers/specs/2026-06-30-meets-e4-selfreg-design.md)。

**E5 纪录与积分榜**：赛事平台收官面，一次交付「成绩荣誉」。
- **赛会纪录 / PB**：纪录板（`GET /records`）按 `(距离×泳姿×性别×年龄组)` 取**历史最快 OK**（年龄组按**成绩当日**计——纪录是当时立的）；游泳者端「我的」→「**我的成绩**」（`GET /me/records`）列每项目 PB，命中赛会纪录加 `🏆`。
- **赛季积分榜**：新增 owner 名下 **赛季 / 系列赛**（`Season`，含**年龄基准日**）。把赛事「归入赛季」（`POST /meets/:id/season`）后，对赛季内每项目在 `性别×年龄组` 组内按名次给分（FINA 式 **9-7-6-5-4-3-2-1**，DNS/DNF/DQ 0、并列同名次同分），跨场累计成赛季积分榜（`GET /seasons/:id`）。**计龄统一用赛季基准日**——同一赛季内每人固定一个年龄组、跨场不漂移。
- **三端**：owner 控制台「**赛季**」「**纪录**」菜单（建/列/删赛季、积分榜、纪录板、公开开关）；公开页 `/p/seasons/:id`（免登录，**PII 安全投影**：只露 姓名/年龄组/成绩/积分，未发布 `404`）；游泳者 PB 页。
- 纪录/积分**全部读时派生**（复用 `computeStandings` + 新纯函数 `points.ts`/`records.ts`），唯一新增持久化是 `Season`(+`Meet.seasonId`)。建赛季为 **Pro 功能**。设计见 [`docs/superpowers/specs/2026-06-30-meets-e5-records-points-design.md`](docs/superpowers/specs/2026-06-30-meets-e5-records-points-design.md)。

> 赛事平台 **E1–E5 已完成**（核心 / 分组泳道 / 公开页 / 自助报名 / 纪录与积分榜）。

## 仍预留的 Phase 2 面（非死代码）

- `POST /pools/:id/register`（按 UUID 自助加入泳池的旧路径，已被认领流程取代，暂留）
- 游泳者**自助加入泳池**（按地理发现 + 申请入会）—— 见设计文档，另立子项目；当前入会仍由 owner 建名册 + 认领链接完成。

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
- **Prometheus 指标**：`GET /metrics`（public、免限流，可被 Prometheus 抓取）暴露默认进程指标（CPU/内存/事件循环/GC）与 HTTP 指标——`http_requests_total`、`http_request_duration_seconds`（标签 `method`/`route`/`status_code`，用路由模板避免标签爆炸）。`METRICS_ENABLED=false` 关闭；生产建议用网络策略限制抓取来源。
- **审计轨迹**：每个**改动型请求**（POST/PATCH/PUT/DELETE）在完成时输出结构化审计日志 `{ audit:true, actor, action, status, requestId, durationMs }`——谁、做了什么、结果如何，便于安全审计与合规检索。
- **统一错误信封**：所有错误返回 `{ statusCode, error, message, requestId, timestamp, path }`（类型见 `@swim/shared` 的 `ApiErrorResponse`）；5xx 堆栈只进日志、不进响应体。
- **安全头 / 压缩**：`helmet` + `compression`。**优雅关闭**：`SIGTERM/SIGINT` → Prisma 断连。

### 邮件

- 传输**可插拔**：配 `SMTP_HOST` 等走真 SMTP；**不配则 dev 传输**——邮件渲染后打到日志（`[DEV MAIL]`），本地/演示可直接从日志取重置链接，无需真凭证。
- 相关变量：`MAIL_FROM`、`SMTP_HOST/PORT/USER/PASS/SECURE`、`PASSWORD_RESET_TTL`（见 `apps/api/.env.example`）。

## 文档

- 设计：[`docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md`](docs/superpowers/specs/2026-06-26-owner-console-phase1-design.md) · [生产加固与可观测性](docs/superpowers/specs/2026-06-27-prod-hardening-observability-design.md) · [刷新令牌轮换 + 登出](docs/superpowers/specs/2026-06-28-refresh-token-rotation-design.md)
- 实现计划：[`docs/superpowers/plans/`](docs/superpowers/plans/)
