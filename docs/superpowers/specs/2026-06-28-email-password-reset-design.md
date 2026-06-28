# 邮件基础设施 + 密码重置（Email + Password Reset）— 设计

> 认证生命周期子项目（#2）的**第二片 #2b**。搭可插拔邮件传输，并以「忘记/重置密码」为首个消费者。
> **需要一次数据库迁移**（User 加两列）。复用 [[#2a]] 的 `RefreshTokenService.revokeAllForUser`。

## 背景与目标

现状：无任何邮件能力；账号无自助找回密码途径（owner 注册自设密码、游泳者经认领设密码，忘了只能人工）。

**目标**

1. **可插拔邮件传输**：`nodemailer`——配 `SMTP_HOST` 走真 SMTP；否则 dev 传输把邮件渲染后**打日志**（无需真凭证即可验收，dev/demo 从日志取链接）。供应商无关、无锁定、易测。
2. **密码重置**：`/auth/forgot-password`（**无枚举**）+ `/auth/reset-password`（哈希校验、1h、单用、**重置即撤销全部会话**）。
3. **两端前端**：web（owner）+ swimmer 各有「忘记密码」入口、忘记页、重置页；重置链接按角色路由。

## 范围与非目标

**范围**：`apps/api`（新 `mail` 模块、`PasswordResetService`、auth 端点、User 两列 + 迁移、`validateEnv` 增项、`@swim/shared` 两个 DTO）、`apps/web` 与 `apps/swimmer`（忘记/重置页 + 登录入口 + 路由 + endpoints）、README、`.env.example`。

**非目标（明确不做）**

- 邮箱验证（#2c）、认领链接自动发信（#2d）。
- 邮件模板引擎（用简单 HTML 字符串）、退信/webhook 处理。
- 按邮箱限流（按 IP 限流足够）。
- 未认领账号（无密码）走重置——它们应走认领链接；`forgot` 对其静默无操作（仍返回 200）。

## 数据模型（迁移）

`User` 加两列（哈希存储，单个活动重置）：

```prisma
  passwordResetTokenHash String?
  passwordResetExpiresAt DateTime?
```

> 与既有 `claimToken`（明文）不同，重置令牌**只存 sha256**（更短命、更敏感）。无需唯一索引（按 hash 查可走普通索引；量小，先不加索引，必要时再补）。

迁移用 `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script` 生成 + `migrate deploy`。

## 邮件基础设施（`mail` 模块）

`apps/api/src/mail/mail.service.ts` —— `MailService` 包 `nodemailer`：

- **传输选择**（启动时一次）：`SMTP_HOST` 有值 → `nodemailer.createTransport({ host, port, secure, auth:{user,pass} })`；否则 dev 传输（`jsonTransport: true`，不真发），并在 `sendMail` 里用 Nest `Logger` 记一条含 `to`/`subject`/正文的 info 日志（dev/demo 可见重置链接）。
- 方法：
  - `sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<void>`
  - `sendPasswordReset(to: string, resetUrl: string): Promise<void>`（组装中文主题/正文，含 `resetUrl`，调 `sendMail`）
- `from` 取 `MAIL_FROM`（默认 `no-reply@swimmingtrace.local`）。

`MailModule` 提供并导出 `MailService`。新增依赖 `nodemailer` + `@types/nodemailer`（dev）。

## 密码重置（`PasswordResetService` + 端点）

独立 `apps/api/src/auth/password-reset.service.ts`，依赖 `PrismaService`、`MailService`、`ConfigService`、`RefreshTokenService`：

```ts
forgot(email: string): Promise<void>   // 无枚举：无论是否存在都正常返回
reset(token: string, password: string): Promise<void>   // 无效/过期 → BadRequestException
```

- `forgot`：按 email 查 user；仅当存在**且 `claimedAt != null`**（有真实密码）才：`token = randomBytes(32).hex`；写 `passwordResetTokenHash = sha256(token)`、`passwordResetExpiresAt = now + PASSWORD_RESET_TTL`；按角色构造 `resetUrl`——OWNER → `${web}/reset-password?token=…`（`web` = `CORS_ORIGIN` 首个），SWIMMER → `${SWIMMER_APP_URL}/reset-password?token=…`；`mail.sendPasswordReset`。无论分支如何，方法都 resolve（控制器统一返回 200）。
- `reset`：按 `sha256(token)` 查 `passwordResetTokenHash`；不存在或 `passwordResetExpiresAt < now` → `BadRequestException('重置链接无效或已过期')`；否则 `passwordHash = bcrypt.hash(password, 12)`、清空两列、`refreshTokens.revokeAllForUser(user.id)`。

**端点**（`auth.controller.ts`，公开、限流）：

| 方法 路径 | 入参 | 行为 |
|---|---|---|
| `POST /auth/forgot-password` | `{ email }` | 总是 `200 {ok:true}`（无枚举），存在且已认领则发信 |
| `POST /auth/reset-password` | `{ token, password }` | 校验→改密+清令牌+撤全部会话；无效/过期 400 |

DTO（`@swim/shared` + class-validator）：`ForgotPasswordDto { email }`、`ResetPasswordDto { token; password(min 8) }`。

## 配置（`validateEnv` 增项，均可选）

| 变量 | 含义 | 默认 |
|---|---|---|
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` | 配齐则走真 SMTP | 空 → dev 传输 |
| `MAIL_FROM` | 发件人 | `no-reply@swimmingtrace.local` |
| `PASSWORD_RESET_TTL` | 重置令牌寿命（时长串）| `1h` |

`SMTP_PORT` 若提供须为数字；`PASSWORD_RESET_TTL` 须匹配时长正则（复用 #2a 的校验风格）。

## 前端（web + swimmer 对称）

- **登录页**：加「忘记密码」链接 → `/forgot-password`。
- **`/forgot-password`**：邮箱输入 → `POST /auth/forgot-password` → 始终显示通用提示「若该邮箱已注册，重置链接已发送」（不泄露是否存在）。
- **`/reset-password`**（读 `?token=`）：新密码 + 确认 → `POST /auth/reset-password` → 成功后提示并跳 `/login`；token 缺失/失败显示错误。
- 两路由**公开**（同 login/claim，置于 ProtectedRoute 之外）。endpoints：`forgotPassword(email)`、`resetPassword(token, password)`。

## 测试策略（TDD）

- **单测**
  - `MailService`：`SMTP_HOST` 有值 → 用 SMTP 传输（mock `nodemailer.createTransport` 断言参数）；无值 → dev 传输且 `sendMail` 不抛、记日志。
  - `PasswordResetService`：`forgot` 存在且已认领 → 写 hash + 调 `sendPasswordReset`（断言 URL 按角色）；不存在 / 未认领 → 不发信但正常返回；`reset` 有效 → 改密 + 清列 + `revokeAllForUser`；过期 / 无效 / 复用 → `BadRequestException`。
- **e2e**（真实库）
  - `forgot-password` 对存在与**不存在**邮箱都 200（无枚举）。
  - 注册 → 取得 reset token（测试中直接读库 `passwordResetTokenHash`？不——明文不留库。改为：测试里调 service.forgot 后，用「已知明文」路径：在 e2e 用一个可注入的假 Mail 捕获 resetUrl 中的 token）。**做法**：e2e 覆盖 `MailService` 为捕获器（`overrideProvider(MailService)`），从 `sendPasswordReset` 入参取 `resetUrl` 解析 token → 调 `reset` → 旧密码登录失败、新密码成功、刷新令牌被撤。
  - 无效 / 过期 token → 400。
- **前端**：忘记页提交后显示通用提示；重置页带 token 提交成功后跳登录（两端，MSW mock 端点）。

## 安全考量

- **无枚举**：`forgot` 恒 200，不区分邮箱是否存在/是否已认领。
- 重置令牌 256-bit、**sha256 哈希存储**、1h 短 TTL、**单用**（用后清列）。
- **重置即撤销全部会话**（`revokeAllForUser`）：挤掉可能已被攻击者持有的会话。
- 端点限流；dev 传输绝不真发信。
- 认领账号接管防御（[[claim-flow-security-invariant]]）不受影响（reset 仅作用于已认领账号）。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| e2e 取不到明文 reset token（只存 hash）| e2e `overrideProvider(MailService)` 捕获 `sendPasswordReset` 的 `resetUrl` 取 token |
| dev 误把真邮件发出 | 无 `SMTP_HOST` 即 `jsonTransport`，永不连真服务器 |
| 角色路由 URL 取错 | OWNER 用 `CORS_ORIGIN` 首个、SWIMMER 用 `SWIMMER_APP_URL`，均已是既有配置 |
| 重置不撤会话 → 旧 token 仍可用 | `reset` 调 `revokeAllForUser`（#2a） |

## 验收标准

- `lint`/`build`(4 包)/`test`/`test:e2e` 全绿，新增单测与 e2e 通过；迁移存在且 `migrate deploy` 干净。
- 无 SMTP 配置下：`forgot` 把重置链接打到日志；`reset` 改密成功、旧密码失效、新密码可登录、旧刷新令牌全失效。
- `forgot` 对不存在邮箱也 200（无枚举）。
- 两端有「忘记密码」入口、忘记页、重置页可用。
- README 鉴权/接口/邮件配置小节更新；`.env.example` 增 SMTP/MAIL_FROM/PASSWORD_RESET_TTL。
