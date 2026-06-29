# #7 数据 / 合规：数据导出 + 账号删除（owner 自助）

> canonical：本 spec。为租户（OWNER）提供 GDPR 式合规基础：数据可携（导出）+ 删除权（擦除）。

## 目标

让作为租户的 **OWNER** 能：
1. **导出自己的全部数据**（账号 + 名下所有泳池及其会员/记录/挑战）为结构化 JSON。
2. **删除账号**：经密码确认后，事务性删除名下全部业务数据与账号本身。

## 范围

**做（后端 `AccountModule`）：**
- `GET /account/export`（`@Roles(OWNER)`）→ `AccountExport`：账号档案 + `pools[]`（每池含 `swimmers`/`sessions`/`challenges`）。只读、安全。
- `DELETE /account`（`@Roles(OWNER)`，体 `{ password }`）→ 校验密码（`bcrypt.compare`），事务删除：名下池的 `swimSession`→`challenge`→`registration`→`pool`→最后 `user`（其 `refreshToken`/`idempotencyKey` 经 FK 级联自动删）。返回 `{ ok: true }`；密码错 → `401`。
- shared：`AccountExport` 接口、`DeleteAccountDto`。

**做（前端 owner 控制台）：**
- 「账号与数据」页（路由 `/account`，布局用户区入口）：
  - 「导出我的数据」→ 拉 `/account/export`，浏览器下载 `account-export.json`。
  - 「删除账号」→ 弹窗输入密码确认 → `DELETE /account` → 清登录态 + 跳登录页。

**不做（非目标）：**
- 游泳者自助导出/删除（owner 为租户主体；记为后续）。
- 软删除/保留期、数据匿名化、删除操作落库审计（删除已由 #5 审计日志记录）。
- 管理员代删、GDPR 工单流程/工具。
- 导出格式协商（仅 JSON）。

## 删除语义（重要）

- 仅删 **owner 名下池**内的 sessions/registrations/challenges 与池本身；**不删**会员（swimmer）的独立 User 账号（他们可能在其他 owner 的池中）——只移除其在本 owner 池的登记与记录。
- owner 自身无 registrations/sessions（OWNER 角色），删 User 即可（级联清 refreshToken/idempotencyKey）。
- 顺序在 `prisma.$transaction([...])` 内固定，满足 FK 约束。
- 删除后 owner 旧 JWT 在过期前仍可验签，但 refresh 已被级联删 → 无法续期；前端主动清态并跳登录。

## 数据结构（@swim/shared）

```ts
export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string; name: string | null; role: string; createdAt: string };
  pools: Array<{
    id: string; name: string; address: string | null;
    latitude: number | null; longitude: number | null;
    createdAt: string; archivedAt: string | null;
    swimmers: Array<{ swimmerId: string; email: string; name: string | null; status: string; joinedAt: string }>;
    sessions: Array<{ id: string; swimmerId: string; poolId: string | null; distanceMeters: number; durationSeconds: number | null; swamAt: string; createdAt: string }>;
    challenges: Array<{ id: string; name: string; goalDistanceMeters: number; startDate: string; endDate: string }>;
  }>;
}
export interface DeleteAccountDto { password: string; }
```

## 测试

- `account.service.spec.ts`：导出 shape（账号 + 池图）；删除——密码错抛 `Unauthorized`；密码对时按序调用 deleteMany/delete（事务）。
- e2e `account-flows.e2e-spec.ts`：建池+会员+记录+挑战后 `GET /account/export` 断言图完整；`DELETE /account` 错密码→401；对密码→204/200，随后 `login` 失败（账号没了）、该 owner 的 swimmer 仍可登录但其在该池登记已无。
- 前端 `AccountPage.test.tsx`：导出按钮触发 export 请求；删除弹窗输入密码 → 调 DELETE 端点。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增“数据与合规”段；自评审；合并 main。
