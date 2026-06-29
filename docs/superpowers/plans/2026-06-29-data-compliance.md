# #7 数据/合规 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-29-data-compliance-design.md`。分支 `feat/api-account`。

## Task 1 — shared 类型
- `packages/shared/src/index.ts`：加 `AccountExport`、`DeleteAccountDto`。

## Task 2 — AccountService（红→绿）
- `account/account.service.ts`：`exportData(ownerId)`、`deleteAccount(ownerId, password)`、`DeleteAccountDto`（class-validator）。
- `account.service.spec.ts`（mock prisma + bcrypt）：
  - export：组装账号 + 池图（含 swimmers/sessions/challenges），日期转 ISO。
  - delete：密码错 → `UnauthorizedException`；密码对 → `$transaction` 收到 [swimSession.deleteMany, challenge.deleteMany, registration.deleteMany, pool.deleteMany, user.delete]（顺序 + where）。
- 红→绿。

## Task 3 — Controller + Module + 接线
- `account/account.controller.ts`：`@Roles(OWNER)` `GET /account/export`、`DELETE /account`（`@HttpCode(200)`，体 `DeleteAccountDto`）。
- `account/account.module.ts`：providers [AccountService, PrismaService]，controllers [AccountController]。
- `app.module.ts`：imports AccountModule。
- 跑 api 单测全绿。

## Task 4 — e2e
- `test/account-flows.e2e-spec.ts`：owner 建池+会员+认领+自录+挑战 → `GET /account/export` 断言图；`DELETE /account` 错密码→401；对密码→200；其后 `POST /auth/login`(owner)→401；swimmer 仍可登录但 `GET /me/pools` 不含该池。
- beforeAll 清库加 idempotencyKey。
- 跑 e2e 全绿。

## Task 5 — 前端 owner 控制台
- `web` endpoints：`exportAccount()`（GET /account/export）、`deleteAccount(password)`（DELETE /account）。
- `features/account/AccountPage.tsx`：两卡片——导出（点按拉取并下载 JSON Blob）、删除（弹窗输密码 → 删除 → `auth-store.clear()` + 跳 `/login`）。
- 路由 `/account` + 布局入口（用户区菜单加「账号与数据」）。
- `AccountPage.test.tsx`：导出按钮触发 export 请求（msw 捕获）；删除弹窗输入密码点确认 → DELETE 被调。
- 跑 web 单测全绿。

## Task 6 — 终验
- 全量 lint/build/test/e2e；README 增“数据与合规”段；自评审；合并 main + 推送 + 删分支。
