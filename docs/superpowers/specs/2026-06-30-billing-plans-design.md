# #3 计费 / 计划：Owner=租户 · 内部 Free/Pro · 自助升级

> canonical：本 spec。承接高端 SaaS track。Owner 即租户（无组织层）；内部计划 + 配额 + 功能门禁，**不接外部支付**。

## 目标

为租户（OWNER）引入订阅计划：**Free / Pro** 两档，服务端强制**配额**（泳池数、会员数）与**功能门禁**（数据导出、挑战赛）。owner 可在控制台**自助升级/降级**（翻计划即生效；真支付为未来 seam）。

## 范围

**做（后端）：**
- Prisma：枚举 `Plan { FREE PRO }`；`User.plan Plan @default(FREE)`、`User.planUpdatedAt DateTime?`；一条迁移。
- 计划限额写**代码配置** `PLAN_LIMITS`（版本可控，非 DB）：
  ```
  FREE: { maxPools: 1,  maxMembers: 25,   features: { export: false, challenges: false } }
  PRO:  { maxPools: 20, maxMembers: 1000, features: { export: true,  challenges: true  } }
  ```
  - `maxPools` 只数**未归档**池；`maxMembers` = owner 名下所有池的**登记总数**。
- `BillingModule` 提供并导出 `BillingService`：
  - `getPlanInfo(ownerId)` → `{ plan, limits, usage:{pools,members}, features }`。
  - `assertCanCreatePool(ownerId)` / `assertCanAddMember(ownerId)`（用量 ≥ 上限 → 抛 402）。
  - `assertFeature(ownerId, 'export'|'challenges')`（计划无此功能 → 抛 402）。
  - `setPlan(ownerId, plan)` → 翻计划 + `planUpdatedAt`，返回新 `PlanInfo`。
- `PaymentRequiredException`（HTTP 402，走现有错误信封）。
- 强制点接入：`PoolsService.createPool`→`assertCanCreatePool`；`PoolsService.createSwimmer`→`assertCanAddMember`；`AccountService.exportData`→`assertFeature('export')`；`ChallengesService` 创建挑战→`assertFeature('challenges')`。
- 端点（owner，挂在 AccountController）：`GET /account/plan`、`POST /account/plan` 体 `{ plan }`。
- shared：`Plan`、`PlanInfo`、`SetPlanDto`。
- 种子：演示 owner 设为 PRO，便于演示两档。

**做（前端 owner 控制台）：**
- 「账号与数据」页加「**计划**」卡：当前计划、用量/上限（泳池、会员）、功能可用性、「升级到 Pro / 降级到 Free」按钮 → `POST /account/plan` → 刷新。
- 别处 402（建池/建会员/挑战）由 #6 全局错误提示自动弹 message。

**不做（非目标）：**
- 真实支付 / Stripe（`POST /account/plan` 即未来支付 seam）。
- 组织 / 团队 / 多成员、按席位或用量计费。
- 降级时删数据（仅**祖父化**：既有保留，低于上限前不能新建）。
- 游泳者端计划感知（附近搜索**不**门禁——见设计取舍）。
- 计划限额入库（写代码配置）。

## 行为契约

- 配额/门禁违规 → **HTTP 402 Payment Required** + `ApiErrorResponse`，message 可读（例「已达 Free 计划上限（最多 1 个泳池），请升级到 Pro」「数据导出为 Pro 功能，请升级到 Pro」）。
- 升级 Pro 后：配额放宽、被门禁功能立即可用。
- 降级 Free：放行；既有泳池/会员**祖父化**保留，但低于上限前 `createPool`/`createSwimmer` 返回 402。
- `GET /account/plan` 公开给 owner 自己（`@Roles(OWNER)`）。

## 测试

- **单测**：`BillingService`——getPlanInfo（计划/限额/用量/功能）、assertCanCreatePool/Member（达限→402、未达→放行）、assertFeature（FREE→402、PRO→放行）、setPlan（翻计划 + planUpdatedAt）。Pools/Account/Challenges 强制点（mock billing）调用断言。
- **e2e**（真库）：Free owner 建 1 池 OK、第 2 池→402；会员到顶→402；`GET /account/export`→402；`POST /account/plan {PRO}`→升级；其后导出/建池/建挑战放行、`GET /account/plan` 反映用量；降级 Free→既有保留、新建→402。
- **web**：PlanCard——展示计划/用量；点升级触发 `POST /account/plan` 并刷新。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增「计划与计费」段；自评审；合并 main。
