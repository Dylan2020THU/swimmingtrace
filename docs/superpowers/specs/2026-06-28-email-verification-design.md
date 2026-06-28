# 邮箱验证（Email Verification，软门禁）— 设计

> 认证生命周期子项目（#2）的**第三片 #2c**。注册后发验证链接、记录 `emailVerifiedAt`，软门禁（不拦登录，仅横幅提示）。
> **需要一次数据库迁移**（User 加三列）。复用 [[#2b]] 的 `MailService`。前端仅动 owner 控制台。

## 背景与目标

现状：注册/认领后账号即可用，无邮箱真实性校验。目标：给自助注册的 OWNER 加邮箱验证闭环，但**不锁人**——未验证仍可登录使用，控制台顶部持久横幅提示并可一键重发。认领的游泳者由 owner 配置邮箱、经认领激活，**认领时自动置为已验证**（游泳者端无注册、不涉验证 UI）。

**目标**

1. OWNER 自助注册 → 发验证邮件；`emailVerifiedAt` 初始为空。
2. `POST /auth/verify-email` 验证；`POST /auth/resend-verification` 重发。
3. **软门禁**：登录不受影响；owner 控制台未验证时显示横幅 + 重发。
4. 认领游泳者 → 认领时 `emailVerifiedAt = now()`（自动已验证）。

## 范围与非目标

**范围**：`apps/api`（User 三列 + 迁移、`EmailVerificationService`、register/claim 接线、`/auth/me` 改 DB 查、两个端点、`MeResponse` 加字段、`validateEnv` 增 `EMAIL_VERIFY_TTL`）、`apps/web`（AppLayout 横幅 + 重发、`/verify-email` 页 + 路由 + endpoints）、README。

**非目标（明确不做）**

- 硬门禁（验证前禁登录）。
- 游泳者端验证 UI（认领即视为已验证）。
- 改邮箱后重新验证（无改邮箱功能）。
- 认领链接自动发信（#2d）。

## 数据模型（迁移）

`User` 加三列：

```prisma
  emailVerifiedAt      DateTime?
  emailVerifyTokenHash String?
  emailVerifyExpiresAt DateTime?
```

`emailVerifiedAt` 为已验证时间戳（空 = 未验证）；后两列为待验证令牌（sha256 哈希 + 过期）。迁移用 `prisma migrate diff … --script` 生成 + `migrate deploy`。

## `EmailVerificationService`（独立，复用 #2b 邮件）

`apps/api/src/auth/email-verification.service.ts`，依赖 `PrismaService`、`MailService`、`ConfigService`：

```ts
sendVerification(userId: string, email: string, role: Role): Promise<void>   // mint+存hash+发信
verify(token: string): Promise<void>                                          // 无效/过期 → BadRequestException
resend(userId: string): Promise<void>                                         // 重新 mint+发信（已验证则静默跳过）
```

- `sendVerification`：`token = randomBytes(32).hex`；写 `emailVerifyTokenHash = sha256(token)`、`emailVerifyExpiresAt = now + EMAIL_VERIFY_TTL`；链接 `${web}/verify-email?token=…`（`web` = `CORS_ORIGIN` 首个；OWNER 注册故走 web）；`mail.sendMail`（专用主题/正文）。
- `verify`：按 `sha256(token)` 查 `emailVerifyTokenHash`；不存在/`emailVerifyExpiresAt < now` → `BadRequestException`；否则 `emailVerifiedAt = now`、清两列。
- `resend(userId)`：查 user；若已 `emailVerifiedAt` 则直接返回（无需重发）；否则重新 `sendVerification`。

## Auth 接线

- **register**（OWNER）：创建 user 后调 `emailVerification.sendVerification(user.id, user.email, user.role)`；仍 `issueSession`（登录照常——软门禁）。
- **claim**（SWIMMER）：`update` data 增 `emailVerifiedAt: new Date()`（认领即已验证）。
- **`GET /auth/me`**：由「回显 JWT 载荷」改为**按 `sub` 查库**，返回 `{ id, email, role, emailVerifiedAt }`（横幅需实时标志，验证后立即消失；仅 `/me` 多一次查询，不影响其它守卫路由）。
- 端点（`auth.controller.ts`）：
  - `POST /auth/verify-email {token}`（公开、限流）→ `verify`，返回 `{ ok: true }`。
  - `POST /auth/resend-verification`（`JwtAuthGuard`）→ `resend(currentUser.id)`，返回 `{ ok: true }`。
- `MeResponse`（`@swim/shared`）加 `emailVerifiedAt: string | null`。
- DTO：`VerifyEmailDto { token }`（放 `auth.service.ts`）。

## 前端（仅 web owner 控制台）

- **AppLayout**：`getMe()` 现含 `emailVerifiedAt`；为空时在顶部显示 antd `Alert`（warning，「请验证你的邮箱以保障账号安全」+「重发验证邮件」按钮 → `resendVerification()` → Toast 提示）。
- **`/verify-email`** 页（读 `?token=`）：**mount 时自动** `POST /auth/verify-email`（点邮件链接即意图验证）→ 成功提示并跳 `/pools`；失败显示「链接无效或已过期」。公开路由。
- endpoints：`verifyEmail(token)`、`resendVerification()`。
- **swimmer 端不动**。

## 配置（`validateEnv` 增项）

| 变量 | 含义 | 默认 |
|---|---|---|
| `EMAIL_VERIFY_TTL` | 验证令牌寿命（时长串）| `24h` |

## 测试策略（TDD）

- **单测**
  - `EmailVerificationService`：`sendVerification` 写 hash + 调 mail（断言链接含 token、走 web 域）；`verify` 有效 → 置 `emailVerifiedAt` + 清列；过期/无效 → `BadRequestException`；`resend` 已验证 → 不发信、未验证 → 发信。
  - `AuthService`：`register` 调 `sendVerification`；`claim` 的 update data 含 `emailVerifiedAt`。
- **e2e**（真实库，`overrideProvider(MailService)` 捕获验证链接）
  - register → 捕获 token → `verify-email` → `/auth/me` 的 `emailVerifiedAt` 非空。
  - 过期/无效 token → 400。
  - `resend-verification`（带 access token）→ 200 且产生新链接。
  - **claim → `/auth/me` 已 `emailVerifiedAt`**（认领自动验证）。
  - 既有 register e2e 仍绿（dev 传输只打日志，不抛）。
- **前端**：AppLayout 在 `me.emailVerifiedAt` 为空时显示横幅 + 重发可点；已验证时无横幅；`/verify-email` 页验证成功后跳 `/pools`。

## 安全考量

- 验证令牌 256-bit、**sha256 哈希存储**、24h、单用（验证后清列）。
- **软门禁**：不因未验证拒绝登录或越权（仅提示）。
- `verify-email` 公开但需持有有效 token；`resend` 需登录（防滥发）。
- 认领自动验证不削弱认领账号接管防御（[[claim-flow-security-invariant]]）——仅在认领成功路径附带置位。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| `/auth/me` 改 DB 查 → 既有断言/性能 | 仅 `/me` 多一次查询；返回仍含 id/email/role，新增字段；既有断言用 `toMatchObject` |
| `MeResponse` 加字段 → 两端编译 | 可选/可空字段；swimmer 不读，不破坏 |
| register 现做邮件 I/O → 既有 e2e | 无 SMTP 即 dev 传输（jsonTransport），只日志不抛；既有 e2e 不受影响 |
| 重发滥用 | `resend` 需登录 + 限流 |

## 验收标准

- `lint`/`build`(4 包)/`test`/`test:e2e` 全绿，新增单测与 e2e 通过；迁移存在且 `migrate deploy` 干净。
- 注册后日志出现验证链接；`verify-email` 置 `emailVerifiedAt`；`/auth/me` 实时反映；认领账号自动已验证。
- owner 控制台未验证显示横幅 + 重发；验证后横幅消失。
- README 鉴权/接口小节更新。
