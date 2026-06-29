# #3 计费/计划 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-30-billing-plans-design.md`。分支 `feat/api-billing`。

## Task 1 — shared 类型
- `Plan = 'FREE' | 'PRO'`、`PlanInfo`、`SetPlanDto`。
- `npm run build -w @swim/shared`（刷新 dist 类型供 api ts-jest）。

## Task 2 — Prisma 模型 + 迁移
- `schema.prisma`：枚举 `Plan { FREE PRO }`；`User.plan Plan @default(FREE)`、`User.planUpdatedAt DateTime?`。
- 手写迁移 `20260630000000_add_plan`：`CREATE TYPE "Plan"`；`ALTER TABLE "User" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE'`, `ADD COLUMN "planUpdatedAt" TIMESTAMP(3)`。
- `prisma generate` + dev 库 `migrate deploy`。

## Task 3 — PaymentRequiredException + BillingService（红→绿）
- `common/payment-required.exception.ts`：402 + `{ statusCode, message, error:'Payment Required' }`。
- `billing/plan.config.ts`：`PLAN_LIMITS`。
- `billing/billing.service.ts`：getPlanInfo / assertCanCreatePool / assertCanAddMember / assertFeature / setPlan。
- `billing/billing.service.spec.ts`（mock prisma）：各方法红→绿。
- `billing/billing.module.ts`：providers [BillingService, PrismaService]，exports [BillingService]。

## Task 4 — 接入强制点（红→绿）
- PoolsModule imports BillingModule；`PoolsService` 注入 BillingService：`createPool` 首行 `await billing.assertCanCreatePool(ownerId)`；`createSwimmer` 首行 `assertCanAddMember(ownerId)`。
- ChallengesModule imports BillingModule；挑战创建处 `assertFeature(ownerId,'challenges')`（先确认 create 签名拿 ownerId）。
- AccountModule imports BillingModule；`AccountService.exportData` 首行 `assertFeature(ownerId,'export')`。
- 各服务 spec 补：mock billing.assert* 被调；既有 spec 注入 mock billing 避免破。
- 跑 api 单测全绿。

## Task 5 — plan 端点
- `AccountController`：`GET /account/plan`→`billing.getPlanInfo(user.id)`；`POST /account/plan` 体 `SetPlanDto`（class-validator `@IsIn(['FREE','PRO'])`）→`billing.setPlan(user.id, dto.plan)`。
- AccountModule 已 import BillingModule。
- 跑 api 单测全绿。

## Task 6 — 种子 + e2e
- seed：演示 owner `plan: 'PRO'`。
- `test/billing-flows.e2e-spec.ts`：Free owner 配额/门禁→402；升级→放行；降级→祖父化 + 新建 402；`GET /account/plan` 用量正确。beforeAll 清库（含 idempotencyKey）。
- 跑 e2e 全绿。

## Task 7 — 前端
- web endpoints：`getPlan()`、`setPlan(plan)`。
- `AccountPage` 加 `PlanCard`（顶部）：当前计划 Tag、用量/上限、功能可用、升级/降级按钮（mutation → 刷新 + message）。
- `AccountPage.test` 补：展示计划；点升级触发 `POST /account/plan`。
- 跑 web 单测全绿。

## Task 8 — 终验
- 全量 lint/build/test/e2e；README 增「计划与计费」段 + 端点表；自评审；合并 main + 推送 + 删分支；通知验收。
