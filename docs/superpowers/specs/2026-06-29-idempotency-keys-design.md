# #4c 幂等键（Idempotency-Key）设计

> 状态：已批准范围（高端 SaaS 质量track，承接 #4a/#4b）。canonical：本 spec。

## 目标

让**创建型 POST** 在网络重试 / 单飞重发下可安全重放：客户端携带 `Idempotency-Key` 头，
首次请求正常执行并把响应（状态码 + 响应体）落库；携带**同一 key** 的重放直接返回原响应，
不再次执行——从根本上避免重复的游泳记录 / 泳池 / 会员。语义对标 Stripe 的 Idempotency-Key。

## 范围

**做：**
- `IdempotencyKey` Prisma 模型 + 迁移（手写 SQL 目录，沿用现有约定）。
- 全局 `IdempotencyInterceptor`（经 `APP_INTERCEPTOR` provider 注册，可注入 `PrismaService`）。
- 头驱动：仅当 `method === POST` **且** 存在 `Idempotency-Key` 头 **且** 请求已认证（`request.user.id` 存在）时介入；否则透传。
- 重放语义、冲突处理（见下）。
- 前端薄接线：游泳者自录 `POST /sessions` 与 owner 代录 `POST /pools/:id/swimmers/:sid/sessions` 携带生成的 `Idempotency-Key`（移动端 / 弱网最易重复的路径）。
- 单测（hash 助手 + 拦截器决策）+ e2e（真库，证明重放不产生重复、冲突返回 422）。
- README：记录该头与生效端点。

**不做（非目标）：**
- GET / PATCH / DELETE 幂等（GET 天然幂等；PATCH/DELETE 暂不纳入）。
- 公开（未认证）POST 的幂等（auth 登录 / 刷新 / 认领等有各自语义，不介入）。
- key 的 TTL / 后台清理作业（仅记录 `createdAt`，留注释说明后续可加清理；本片不实现调度器）。
- claim-link / archive 等天然幂等或刻意每次重生的端点（机制对其透传，前端不发 key）。

## 数据模型

```prisma
model IdempotencyKey {
  id             String    @id @default(uuid())
  userId         String
  key            String
  method         String
  path           String
  requestHash    String
  responseStatus Int?
  responseBody   Json?
  completedAt    DateTime?
  createdAt      DateTime  @default(now())

  @@unique([userId, key])
  @@index([createdAt])
}
```

- **作用域按 userId**：不同用户用同名 key 互不影响（`@@unique([userId, key])`）。
- **进行中** = 行存在但 `completedAt` 为 null；**已完成** = `completedAt` 已写。
- 迁移目录：`prisma/migrations/20260629000000_idempotency_key/migration.sql`（手写 `CREATE TABLE` + 唯一索引 + 普通索引），随后 `prisma migrate deploy`。

## 拦截器流程（IdempotencyInterceptor）

执行顺序：Nest 守卫（含 JWT）先于拦截器运行，故拦截器内可读 `request.user.id`。

1. 非 POST / 无 `Idempotency-Key` 头 / 未认证 → `next.handle()` 透传。
2. 计算 `requestHash = sha256(JSON.stringify({ method, path, body }))`（`path` 含 query；`body` 为已解析载荷）。
3. 按唯一键 `(userId, key)` 查找：
   - **已完成**（`completedAt` 非空）：
     - `requestHash` 不一致 → `422 Unprocessable Entity`（同 key 复用于不同参数）。
     - 一致 → **重放**：`res.status(responseStatus)` 并返回 `responseBody`（短路，不执行 handler）。
   - **进行中**（`completedAt` 为空）→ `409 Conflict`（同 key 请求正在处理）。
   - **不存在** → 尝试 `create` 一行 `{ userId, key, method, path, requestHash, completedAt: null }`。
     - `create` 抛 `P2002`（并发同 key 抢占）→ `409 Conflict`。
     - 成功 → 执行 handler：
       - 成功发射：在 `mergeMap` 中 `await` 更新该行 `{ responseStatus, responseBody, completedAt: now }` 后再返回响应体（确保落库先于响应发出）。
       - handler 抛错：`catchError` 中删除该“进行中”行（避免毒化 key，允许客户端重试），再 rethrow。

响应体捕获用 RxJS `mergeMap`（异步落库被 await）；错误用 `catchError` 清理。所有目标端点为 POST 201，
重放时 `responseStatus`（201）与路由默认一致，状态码与响应体逐字节一致。

## 接口契约

- 请求头：`Idempotency-Key: <客户端生成的唯一串，建议 uuid v4>`。
- 成功首次：正常 201 + 实体；落库。
- 重放（同 key 同载荷）：返回与首次**逐字段一致**的响应（不重复建库）。
- 同 key 不同载荷：`422`，错误信封 `ApiErrorResponse`。
- 进行中并发：`409`，错误信封。
- 未带头 / 未认证 / 非 POST：行为不变（透传）。

## 测试

- **单测**：`requestHash` 助手确定性；拦截器决策（用 mock `ExecutionContext`/`CallHandler` + mock Prisma）覆盖：透传、重放命中、422、409、首次落库。
- **e2e（真库）**：游泳者登录后 `POST /sessions` 带 key → 201；同 key 同载荷重放 → 同一 session id、`GET /sessions/me` 总数不增；同 key 改载荷 → 422。

## 前端接线（薄）

- 新增 `idempotencyKey()`（uuid v4）助手（两端各自 lib）。
- 游泳者端 `recordMySession` 与 owner 端代录请求：在请求配置加 `headers: { 'Idempotency-Key': idempotencyKey() }`。每次提交生成一枚 key；axios 单飞续期重发同一 config → 复用同 key → 弱网重试自动去重。
- 无新 UI；按钮 loading 态仍负责防连点。

## 验收门

lint / build / test（api+web+swimmer）/ e2e 全绿；README 标注；自评审；合并 main。
