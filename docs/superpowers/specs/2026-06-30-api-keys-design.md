# #4d API Keys：程序化访问（act-as-owner · Pro 门禁 · Bearer swk_ 前缀）

> canonical：本 spec。承接 #3（计划门禁）。owner 用长寿命密钥让脚本/集成免交互登录调 API。

## 目标

让 OWNER 创建 **API key**，脚本携 `Authorization: Bearer swk_…` 即可调用其 owner 端点（**充当 owner**，与该 owner 的 JWT 同权）。key **只存哈希**、明文仅创建时返回一次；创建为 **Pro 功能**。

## 范围

**做（后端）：**
- Prisma `ApiKey { id, ownerId(FK cascade), label, prefix, keyHash@unique, lastUsedAt?, createdAt }` + `User.apiKeys` + 迁移。
- `api-keys/api-key.util.ts`：`API_KEY_PREFIX='swk_'`；`generateApiKey()`→`{ plaintext, prefix, keyHash }`（`swk_`+`randomBytes(24).base64url`，prefix=前 12 字符）；`hashApiKey(token)`→sha256 hex。
- `ApiKeysService`（`ApiKeysModule`，imports `BillingModule`）：
  - `create(ownerId, label)`：`billing.assertFeature(ownerId,'apiKeys')` → 生成/哈希/落库 → 返回 `{ id, label, prefix, key:<明文>, createdAt }`。
  - `list(ownerId)`：`[{ id, label, prefix, lastUsedAt, createdAt }]`（**绝不**含 hash/明文）。
  - `revoke(ownerId, id)`：校验归属 → 删行。
- **增强 `JwtAuthGuard`**（`common/auth.common.ts`，注入 `PrismaService`）：`Authorization: Bearer` 的 token 以 `swk_` 开头 → `hashApiKey` 查 `ApiKey`，命中则 `req.user={id:ownerId,role:'OWNER',email,emailVerifiedAt}` + 异步刷 `lastUsedAt`、返回 true；未命中 → 401；非 `swk_` → 委托原 JWT 路径（`super.canActivate`）。**零控制器改动**，所有用 JwtAuthGuard 的 owner 端点自动支持 key。
- `ApiKeysController`（`@Roles(OWNER)`）：`POST /api-keys`、`GET /api-keys`、`DELETE /api-keys/:id`。
- billing：`PLAN_LIMITS.features` 加 `apiKeys`（FREE false / PRO true）；`assertFeature` 联合类型加 `'apiKeys'`；`PlanInfo.features` 加 `apiKeys`。
- shared：`ApiKeyListItem`、`CreatedApiKey`、`CreateApiKeyDto`。

**做（前端 owner 控制台）：**
- 「账号与数据」加「API Keys」卡：列表（label / prefix / 最后使用）+「新建」弹窗（输 label → 创建 → **明文仅此一次**显示 + 复制 + 警示）+ 每行「撤销」。按 `plan.features.apiKeys` 门禁 UI（Free 提示升级 Pro；后端仍真门禁）。

**不做（非目标）：**
- 作用域/只读 key、per-key 限流、过期、key 轮换、swimmer 用 key、key 明文二次查看。

## 安全

- 只存 `sha256(明文)`；明文仅创建响应里出现一次（前端显著提示「仅显示一次」）。
- key 走 `Authorization` 头 → 现有 pino `redact: req.headers.authorization` 已脱敏，不进日志。
- key 充当 owner（role OWNER）；命中 swimmer-only 端点（`@Roles(SWIMMER)`）会被 RolesGuard 403。
- `prefix` 仅用于识别，不足以重建密钥。撤销=删行，立即失效。

## 行为契约

- `POST /api-keys`（Pro）→ `201 { id, label, prefix, key, createdAt }`；Free → `402`。
- `GET /api-keys` → `200 [{ id, label, prefix, lastUsedAt, createdAt }]`。
- `DELETE /api-keys/:id` → `200`；非本人 key → `404`/`403`。
- 用有效 `Bearer swk_…` 调 owner 端点 → 成功，`lastUsedAt` 刷新；失效/撤销 key → `401`。

## 测试

- 单测：util（prefix 格式、hash 确定性、生成唯一）；ApiKeysService（Pro 门禁→402、create 返回明文且库里只存 hash、list 无密、revoke 校验归属）；增强 guard（`swk_` 命中设 owner、失效→401、非 key 委托 JWT）。
- e2e：Pro owner `POST /api-keys`→拿明文→用 `Bearer swk_…` `POST /pools`/`GET /pools` 成功→`GET /api-keys` 见 prefix 且 lastUsedAt 非空→`DELETE`→再用该 key→401；Free owner `POST /api-keys`→402。
- web：ApiKeysCard（列表渲染、新建显示明文一次、撤销调用 DELETE）。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增「API Keys」段 + 端点；自评审；合并 main。
