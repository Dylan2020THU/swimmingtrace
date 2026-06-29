# #4c 幂等键 实现计划（TDD）

承接 spec：`docs/superpowers/specs/2026-06-29-idempotency-keys-design.md`。分支 `feat/api-idempotency`。

## Task 1 — Prisma 模型 + 迁移
- `schema.prisma` 增 `IdempotencyKey` 模型（见 spec）。
- 手写迁移 `prisma/migrations/20260629000000_idempotency_key/migration.sql`：`CREATE TABLE "IdempotencyKey" (...)` + `CREATE UNIQUE INDEX ON ("userId","key")` + `CREATE INDEX ON ("createdAt")`。
- `prisma generate`（postinstall 钩子已有；显式跑一次让 `@prisma/client` 含新模型）。
- 对 dev 库 `prisma migrate deploy` 验证迁移可用。
- 验证：`npx prisma validate`；client 类型含 `idempotencyKey`。

## Task 2 — requestHash 助手（红→绿）
- 新建 `src/common/idempotency/request-hash.ts`：`requestHash(method, path, body): string`（sha256 hex）。
- `request-hash.spec.ts`：相同输入稳定、不同载荷不同、不同 path 不同。
- 红（文件不存在）→ 实现 → 绿。

## Task 3 — IdempotencyInterceptor（红→绿）+ 接线
- `src/common/idempotency/idempotency.interceptor.ts`：实现 spec 流程（透传 / 重放 / 422 / 409 / 首次落库 / 失败清理）。
- `idempotency.interceptor.spec.ts`：mock `ExecutionContext`（POST + header + user）、`CallHandler`、Prisma：
  - 非 POST / 无头 / 无 user → 透传（next.handle 被调用）。
  - 已完成 + 同 hash → 重放（不调用 next，res.status 被设为存储值）。
  - 已完成 + 异 hash → 抛 422。
  - 进行中 → 抛 409。
  - 不存在 → create 被调用，handler 执行，完成时 update 落库。
  - create P2002 → 抛 409。
- 在 `app.module.ts` 注册 `{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }`。
- 红→绿；跑 api 单测全绿。

## Task 4 — e2e（真库）
- `test/idempotency.e2e-spec.ts`：注册 OWNER→建池→建会员→生成认领链接→认领得 SWIMMER token（或复用 swimmer-flows 既有路径）；游泳者 `POST /sessions` 带 `Idempotency-Key` → 201 拿 id；同 key 同载荷重放 → 同 id、`GET /sessions/me` total 不增；同 key 改 distance → 422。
- beforeAll 清库顺序加 `idempotencyKey.deleteMany()`。
- 跑 e2e 全绿。

## Task 5 — 前端薄接线
- swimmer：`src/lib/idempotency.ts` 导出 `idempotencyKey()`（crypto.randomUUID）；`endpoints.recordMySession` 加 `headers: { 'Idempotency-Key': idempotencyKey() }`。
- web：同样的 helper；owner 代录 `recordSession`（`/pools/:id/swimmers/:sid/sessions`）加头。
- 各加一条测试：mutation 发出的请求带 `Idempotency-Key` 头（msw 捕获断言）。
- 跑两端单测全绿。

## Task 6 — 终验
- 全量 lint/build/test/e2e。
- README：在端点表 / 架构要点标注 `Idempotency-Key`（认证 POST 可选，重放去重）。
- 自评审（对照 spec 非目标，无范围蔓延）。
- 合并 main + 推送 + 删分支。
