# 认领链接自动发信（Auto-email Claim Link）— 设计

> 认证生命周期子项目（#2）的**末片 #2d**，落地后 #2 整片完成。复用 [[#2b]] 的 `MailService`。
> **无数据库迁移**；纯增量——生成认领链接时**额外**发邮件，仍照常返回链接。

## 背景与目标

现状：owner 在控制台点「生成认领链接」→ 后端 `PoolsService.generateClaimLink` 铸 token、返回 `{ claimToken, claimUrl, expiresAt }`，owner **手动复制**分发（微信/短信）。目标：生成时**自动把链接发到该游泳者邮箱**，同时保留手动复制兜底。

## 范围与非目标

**范围**：`apps/api`（`MailService.sendClaimLink`、`PoolsService.generateClaimLink` 发信、`PoolsModule` 导入 `MailModule`、单测 + e2e）、`apps/web`（生成成功视图加「已发送」提示）、README。

**非目标**：改认领流程本身；单独的「重发认领邮件」端点（重新生成即重新发信）；数据库迁移；`ClaimLinkResponse` 形状变更。

## 设计

### 后端

- `MailService` 加 `sendClaimLink(to: string, claimUrl: string): Promise<void>`——组装「你被邀请加入泳池」邮件（含 `claimUrl`，7 天有效），调 `sendMail`。
- `PoolsService.generateClaimLink`：注入 `MailService`；在构造 `claimUrl` 之后、返回之前，`await this.mail.sendClaimLink(target.email, claimUrl).catch((e) => this.logger.warn(...))`——**尽力而为**：邮件失败不影响生成，仍返回 `{ claimToken, claimUrl, expiresAt }`（owner 可手动复制）。
- `PoolsModule` `imports: [MailModule]`。
- **守卫不变**：仍要求 `target.role === 'SWIMMER'` 且 `!target.claimedAt`（[[claim-flow-security-invariant]] 账号接管防御原样保留）；邮件发往 owner 创建该游泳者时填的邮箱。

### 前端（owner 控制台）

生成认领链接成功视图：保留可复制的链接，**加一行**「已发送邮件至该游泳者邮箱」。`ClaimLinkResponse` 不变（控制台本就知道该游泳者邮箱）。

## 测试策略（TDD）

- **单测**
  - `MailService.sendClaimLink`：调底层 `sendMail`，`to`/正文含 `claimUrl`。
  - `PoolsService.generateClaimLink`：调 `sendClaimLink(target.email, claimUrl)` 且仍返回 `{ claimToken, claimUrl, expiresAt }`；邮件抛错时**不**影响返回（catch）。
- **e2e**：`POST /pools/:id/swimmers/:sid/claim-link`（`overrideProvider(MailService)` 捕获）→ 返回链接 **且** 触发发信，捕获到的 URL == 返回的 `claimUrl`；守卫回归（对已认领/非 SWIMMER → 冲突）保持。
- **前端**：生成成功后视图出现「已发送」提示。

## 安全考量

- 守卫与 token 语义不变；邮件仅发往 owner 配置的游泳者邮箱。
- 尽力而为发信：邮件子系统故障不会阻断 owner 拿到链接（可手动分发）。
- dev 传输不真发信（无 `SMTP_HOST` 时打日志）。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| 发信失败阻断生成 | `.catch` 尽力而为，生成仍成功并返回链接 |
| `PoolsService` 体积增大 | 仅注入 + 一行发信调用，影响极小 |
| 既有 claim-link e2e（不 override Mail）| register/claim-link 现走真 `MailService`（dev 传输只日志不抛），不受影响 |

## 验收标准

- `lint`/`build`(4 包)/`test`/`test:e2e` 全绿，新增单测与 e2e 通过。
- 生成认领链接：无 SMTP 时日志出现认领链接邮件；返回体仍含 `claimUrl`；owner 控制台显示「已发送」。
- 守卫不回归（非 SWIMMER / 已认领 → 冲突）。
- README：将「手动复制分发」改述为「自动发邮件（+ 手动复制兜底）」。
