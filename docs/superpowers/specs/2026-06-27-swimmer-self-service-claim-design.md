# 游泳者自助 + 账号认领 · Phase 2-A 设计

- **日期**：2026-06-27
- **分支**：feat/phase2-swimmer-self-service
- **状态**：已确认（用户跳过 spec 复审，直接转实现）
- **上游**：[[2026-06-26-owner-console-phase1-design]] 的 Phase 2 拆解之第一个子项目

---

## 1. 背景与定位

Phase 1 交付了 OWNER 管理控制台：owner 建泳池、建会员、**代录**游泳记录、看三层看板。当前所有游泳数据都靠 owner 代录，游泳者自己无法登录与录入。

Phase 2 被拆为 4 个独立子项目（赛事/挑战/排行榜、游泳者自助+认领、形态切换、附近泳池地图），各自走 spec→plan→实现。**本 spec 只覆盖第一个子项目：游泳者自助 + 账号认领。**

目标：让 owner 建的游泳者账号被本人**认领**（设密码、登录），并通过一个**移动优先的游泳者端**自助录入游泳、查看个人看板。这把"全靠代录"的临时状态转为真正的游泳者参与，是后续"赛事形态"真正有意义的前提。

### 已有基础（决定本子项目不大）

- 后端面向游泳者的端点早已作为 Phase 2 预留面存在并带 `@Roles(SWIMMER)`：`POST /sessions`（自录）、`GET /sessions/me`（自己的历史）、`GET /stats/heatmap`、`GET /stats/summary`。本期**正式启用**它们。
- `User.claimedAt DateTime?` 占位字段已在（owner 建的账号为 null，UI 显示"未认领"）。
- 鉴权（JWT + `JwtAuthGuard` + `RolesGuard`）、`@nestjs/throttler`、`@swim/shared` 类型契约、前端 axios/Zustand/React Query 模式均已成熟，可复用。

---

## 2. 目标与非目标

### 目标

- owner 在控制台为某游泳者**生成一次性认领链接**（手动分发，无邮件/短信基础设施）。
- 游泳者打开链接 → 校验令牌 → **设密码认领** → 自动登录。
- 游泳者在移动端 App：登录、**选所属泳池自助录入**游泳、看个人看板（热力图/汇总）+ 历史。
- 自录数据干净地进入 owner 的单泳池看板（按 `poolId` 聚合）。

### 非目标（明确排除）

- 邮件/短信发送（认领链接由 owner 手动转发）。
- 游泳者自助注册新账号、自助加入泳池、编辑资料/改密码（→ 后续）。
- 赛事/挑战/排行榜、形态切换、附近泳池地图（→ Phase 2 其他子项目）。
- refresh token（沿用单 access token）。
- 精美 UI 打磨之外的原生 App / PWA 离线能力。

---

## 3. 关键决策记录

| # | 决策 | 取舍理由 |
|---|---|---|
| D1 | 认领靠 **owner 生成链接 + 手动分发** | 无需邮件/短信基础设施；owner 控制谁能访问；令牌一次性 + 过期，安全可控 |
| D2 | 游泳者端为**新建 `apps/swimmer` 移动优先 SPA** | owner 控制台保持 PC、游泳者端独立移动 UX，关注点干净；复用 `@swim/shared` 与同一后端 |
| D3 | 认领令牌**明文存于 `User` 两列**（非新表、非哈希） | owner 可事后多次复制链接；令牌一次性 + 7 天过期 + 仅能认领单个 SWIMMER 账号，风险可控 |
| D4 | 自录带 `poolId` 时**校验本人在该池 ACTIVE 登记** | 否则自录数据落不进 owner 泳池看板或污染非本人池 |
| D5 | UI 库选 **antd-mobile** | 与 Phase 1 AntD 生态一致、移动组件齐全 |
| D6 | axios+authstore 等小工具**复制不抽包** | 避免过早抽象；出现第 3 个前端消费方再抽 `packages/client` |

---

## 4. 架构与仓库结构

触及三处，边界清晰：

```
swimmingtrace/
├─ apps/
│  ├─ api/                      # 扩展：认领端点 + my-pools + 自录校验；启用 SWIMMER 端点
│  ├─ web/                      # 小改：名册/游泳者详情新增「生成认领链接」动作
│  └─ swimmer/                  # 新建：移动优先 React+Vite SPA（antd-mobile）
│     └─ src/{app,lib,features,components}/
└─ packages/shared/            # 扩展：认领与 my-pools 相关类型
```

- `apps/swimmer` 复用 Phase 1 前端模式：axios 实例（`baseURL='/api'` + Bearer 拦截器 + 401→`/login`）、Zustand `useAuthStore`（token+user 持久化）、React Query hooks + 强类型端点、`@swim/shared` 类型、`ProtectedRoute`（需 token 且 `role==='SWIMMER'`）。
- Vite dev proxy `/api`→`localhost:3000`，独立端口 **5174**；生产同 Phase 1 走 `CORS_ORIGIN` 白名单（需把 swimmer 源加入白名单）。
- 根脚本扩展：`dev` 同起三端、`build`/`test`/`lint` 纳入 `@swim/swimmer`。

---

## 5. 数据模型改动（最小）

在 `model User` 增加两列（不新建表）：

```prisma
  claimToken          String?   @unique
  claimTokenExpiresAt DateTime?
```

- owner 生成认领链接：写入随机 32 字节 URL-safe `claimToken` + `claimTokenExpiresAt = now + 7d`；同一游泳者重新生成即覆盖（单个有效令牌）。
- 认领成功：写 `passwordHash`（bcrypt 12）+ `claimedAt = now`，并清空 `claimToken`/`claimTokenExpiresAt`。
- 需要一条迁移（`add_user_claim_token`）。

---

## 6. 后端扩展

### 6.1 接口清单

| 方法 路径 | 角色 | 状态 | 作用 |
|---|---|---|---|
| `POST /pools/:id/swimmers/:sid/claim-link` | OWNER（且拥有该池+游泳者） | NEW | 生成/重置认领令牌，返回 `{ claimToken, claimUrl, expiresAt }` |
| `GET /auth/claim/:token` | 公开（限流） | NEW | 校验令牌，返回 `{ name, email }`；无效/过期/已认领 → 404/410 |
| `POST /auth/claim` | 公开（限流） | NEW | `{ token, password }` → 写 pw+claimedAt、清令牌，返回 `{ accessToken }`（自动登录） |
| `GET /me/pools` | SWIMMER | NEW | 本人 ACTIVE 登记的泳池 `{ id, name }[]` |
| `POST /sessions` | SWIMMER | 启用+加固 | 带 `poolId` 时校验本人在该池 ACTIVE 登记，否则 403 |
| `GET /sessions/me` | SWIMMER | 启用 | 本人游泳历史 |
| `GET /stats/heatmap?year=` `GET /stats/summary` | SWIMMER | 启用 | 个人热力图/汇总 |

### 6.2 类型（`@swim/shared` 新增）

```ts
// claim（owner 侧生成）
interface ClaimLinkResponse { claimToken: string; claimUrl: string; expiresAt: string; }
// claim（游泳者侧）
interface ClaimInfoResponse { name: string | null; email: string; }
interface ClaimAccountDto { token: string; password: string; }
// my pools
interface MyPoolItem { id: string; name: string; }
// 自录历史（GET /sessions/me 单项）
interface SwimSessionItem { id: string; poolId: string | null; distanceMeters: number; durationSeconds: number | null; swamAt: string; }
```

> 复用既有：`LoginResponse`、`MeResponse`、`CreateSessionDto`、`HeatmapCell`、`SwimmerStats.summary` 形状。

### 6.3 规则与所有权

- `claim-link`：`assertOwnsPool(owner, poolId)` + 校验 `:sid` 在该池有 Registration（沿用 Phase 1 风格），再写令牌。`claimUrl` 由后端用 `SWIMMER_APP_URL`（env，默认 `http://localhost:5174`）拼成 `${SWIMMER_APP_URL}/claim/${token}`。
- `POST /auth/claim`：按 `claimToken` 查 User；令牌不存在/过期/该用户 `claimedAt != null` → 对应 4xx；否则 `bcrypt.hash(password,12)` 写库、清令牌、签发 token。密码 `@MinLength(8)`。
- `GET /me/pools`：查本人 `status: 'ACTIVE'` 的 Registration → 关联 pool 的 `{id,name}`。
- `POST /sessions` 加固：若 `dto.poolId` 存在，校验存在 `Registration{ swimmerId: user.id, poolId, status: 'ACTIVE' }`，否则 `ForbiddenException`。
- 公开认领端点加 `@Throttle`（如 10/60s）。

---

## 7. 游泳者前端（apps/swimmer）

### 7.1 路由与守卫

| 路由 | 守卫 | 页面 |
|---|---|---|
| `/claim/:token` | 公开 | 认领页：校验令牌→展示姓名/邮箱→设密码（≥8 + 二次确认）→认领→自动登录→`/` |
| `/login` | 公开 | 已认领游泳者回访登录（邮箱+密码） |
| `/` | SWIMMER | 看板：个人汇总（总里程/次数/时长）+ 热力图 + 醒目「记录一次游泳」 |
| `/record` | SWIMMER | 选所属泳池（`GET /me/pools`）+ 距离/时长/日期 → 提交 → 失效统计与历史 |
| `/history` | SWIMMER | 我的游泳历史 |

底部 Tab 导航：看板 / 历史 / 我的（登出）。`ProtectedRoute` 统一：无 token→`/login`；有 token 但 `role!=='SWIMMER'`→提示用 owner 控制台。

### 7.2 数据层

镜像 `apps/web`：axios `client.ts`（拦截器）、`auth-store.ts`（Zustand 持久化 `swim-swimmer-auth`）、`endpoints.ts`（强类型）、`queries.ts`（React Query hooks + key + 失效）。启动时有 token 则 `GET /auth/me` 回填 user。

### 7.3 关键库

| 用途 | 选型 |
|---|---|
| 移动 UI/表单/列表/Tab | antd-mobile |
| 热力图 | `@uiw/react-heat-map`（复用） |
| 服务端状态 / 客户端状态 / 路由 / HTTP / 日期 | React Query / Zustand / React Router / axios / dayjs |

---

## 8. owner 控制台改动（apps/web，小）

- 在游泳者详情页（或名册行）增「生成认领链接」动作：调 `POST /pools/:id/swimmers/:sid/claim-link` → 弹窗展示 `claimUrl` + 「复制」+ 过期时间；已认领（`claimedAt != null`）的游泳者隐藏/禁用该动作并显示"已认领"。
- 新增 `useGenerateClaimLink` mutation 与端点函数。

---

## 9. 错误处理

- 后端：认领令牌无效→`404`、过期→`410`、账号已认领→`409`；自录非本人池→`403`；DTO 校验→`400`。沿用 NestJS 默认错误体。
- 游泳者前端：响应拦截器 `401`→清登录态跳 `/login`；其余 4xx/5xx→antd-mobile `Toast`。认领页对 404/410/409 给明确文案（链接无效/已过期/已被认领）。表单校验镜像后端 DTO。

---

## 10. 测试策略（沿用 Phase 1，TDD）

### 后端（Jest）

- **单测**（mock Prisma）：生成认领链接（owner 所有权 + 写令牌/过期）、认领 service（有效→写 pw/claimedAt/清令牌+签发；令牌无效/过期/已认领→各错误）、`myPools`、自录泳池归属校验（非成员→403）。
- **e2e**（supertest + 测试库）：完整认领 happy path（owner 建游泳者→生成链接→`GET /auth/claim`→`POST /auth/claim`→`POST /sessions`(带 poolId)→该记录出现在 owner `GET /stats/pool/:id`）；坏/过期令牌；非成员池录入→403；已认领再认领→409。

### 游泳者前端（Vitest + RTL + MSW）

- 认领页（有效令牌渲染表单→提交存 token+跳转）、登录、`ProtectedRoute` 角色、录入流（选池+提交→失效）、看板渲染。不引入 Playwright。

### owner 端（apps/web）

- `useGenerateClaimLink` 与「生成认领链接」弹窗（MSW）。

---

## 11. 实现顺序建议（供 writing-plans）

1. **数据模型 + 迁移**：`User.claimToken`/`claimTokenExpiresAt`，建并提交迁移。
2. **共享类型**：落地 §6.2。
3. **后端**（TDD，逐端点）：claim-link → `GET/POST /auth/claim` → `GET /me/pools` → `POST /sessions` 加固 → 配单测/e2e。
4. **owner 控制台**：生成认领链接 UI + mutation。
5. **`apps/swimmer` 脚手架**：Vite+React+antd-mobile、路由、axios/auth store、ProtectedRoute、测试工具链（含根脚本/CI 纳入）。
6. **游泳者屏幕**：认领 → 登录 → 看板 → 录入 → 历史。
7. **e2e 串联与回归**；README/CI 更新。
