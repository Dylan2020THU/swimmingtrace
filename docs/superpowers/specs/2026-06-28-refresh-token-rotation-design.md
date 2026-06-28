# 刷新令牌轮换 + 登出（Refresh Token Rotation + Logout）— 设计

> 认证生命周期子项目（#2）的**首片 #2a**。把单 access token 升级为「短寿命 access + 旋转 refresh」，
> 带服务端真撤销与复用检测。**需要一次数据库迁移**（新增 `RefreshToken` 表）。

## 背景与目标

现状：`auth.service.ts` 的 `sign()` 只签发一个 access token（JWT，默认 1 天），代码里留着
`// TODO (Phase 2): add refresh tokens + rotation.`。无服务端会话、无法真正登出（stateless JWT 到期前一直有效）、token 失窃无从撤销。

**目标**：兑现该 TODO，达到商业 SaaS 的会话基线——

1. **短寿命 access**（15m）+ **旋转 refresh**（30d 滑动）。
2. **服务端会话**：refresh 以哈希存库，可真正撤销（登出/全登出生效）。
3. **轮换 + 复用检测**：每次 `/auth/refresh` 旋转；旧 token 被重放 ⇒ 判为失窃 ⇒ 撤销整个会话家族。
4. **两端静默续期**：web + swimmer 的 axios 拦截器在 401 时单飞续期并重试。

## 范围与非目标

**范围**：`apps/api`（auth 模块 + 新 `RefreshToken` 表 + 迁移 + `@swim/shared` 的 `LoginResponse` 加字段）、`apps/web` 与 `apps/swimmer`（auth-store + axios 拦截器 + login/claim/logout）、`validateEnv` 增项、README 更新。

**非目标（明确不做）**

- **不**用 httpOnly cookie（已选「响应体返回 + 客户端存储」）。
- **不**含邮件、密码重置、邮箱验证（#2b/#2c/#2d）。
- **不**做会话列表/设备管理 UI（`logout-all` 仅 API；YAGNI）。
- **不**做 2FA。
- 除「access TTL 1d→15m」与「login/register/claim 响应体加 `refreshToken`」外，不改既有端点行为。

## 数据模型（迁移）

新增 `RefreshToken` 表；`User` 加反向关系 `refreshTokens RefreshToken[]`。

```prisma
model RefreshToken {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique         // sha256(明文 256-bit 随机串)
  familyId     String                    // 一次登录 = 一个家族；轮换沿用同一 familyId
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?
  replacedById String?                   // 轮换出的新 token id（链式追溯）
  @@index([userId])
  @@index([familyId])
}
```

- 明文 refresh = `randomBytes(32).toString('hex')`（256-bit 高熵）。存库只存 `sha256(明文)`（高熵串用快哈希即可，不用 bcrypt——避免每次续期的昂贵开销，且无字典攻击面）。
- 按 `tokenHash`（唯一索引）O(1) 查找。
- 迁移用 `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` 生成 + `migrate deploy`（非交互环境既定做法）。

## 令牌形态与寿命

| | 形态 | 寿命 | 来源 |
|---|---|---|---|
| access | JWT，payload `{sub,email,role}`（不变）| `JWT_EXPIRES_IN`，**默认 1d→15m** | `JwtService.sign` |
| refresh | 不透明随机串（非 JWT）| `REFRESH_TOKEN_TTL`，默认 `30d` | `randomBytes` |

refresh 为「滑动」：每次轮换签发新 refresh 并给新的 30d 过期——活跃用户不掉线，30d 不活跃则会话自然失效。

## 服务边界

新建 `RefreshTokenService`（`apps/api/src/auth/refresh-token.service.ts`），独立负责 refresh 生命周期与 DB：

```ts
issue(userId, familyId?): Promise<string>        // 新明文 token（存其 hash）；无 familyId 则开新家族
rotate(presentedPlain): Promise<{ token: string; userId: string; email; role }>  // 校验+轮换；复用则抛并撤族
validate(presentedPlain): Promise<RefreshTokenRow>   // 仅校验（未撤销/未过期）
revoke(presentedPlain): Promise<void>            // 撤销单个（登出；幂等）
revokeFamily(familyId): Promise<void>
revokeAllForUser(userId): Promise<void>          // 全登出
```

`AuthService` 把原 `sign()` 改为 `issueSession(user)`：签 access + `RefreshTokenService.issue` → 返回 `{ accessToken, refreshToken }`。`login/register/claim` 全部改走它。新增 `refresh/logout/logoutAll` 编排方法。

`@swim/shared` 的 `LoginResponse`：`{ accessToken: string }` → **加** `refreshToken: string`。

## 端点（均限流；refresh/logout 公开如 `/auth/login`，logout-all 加 JWT 守卫）

| 方法 路径 | 入参 | 行为 |
|---|---|---|
| `POST /auth/refresh` | `{ refreshToken }` | 按 hash 查→未撤销未过期则**轮换**（撤旧、同族签新）→ `{accessToken, refreshToken}`。**复用检测**见下。 |
| `POST /auth/logout` | `{ refreshToken }` | 撤销该 token（幂等，无效 token 也返回 204）。 |
| `POST /auth/logout-all` | —（`@Roles` 任意已登录）| 撤销该用户全部 refresh。 |

## 轮换与复用检测语义

`/auth/refresh` 收到明文 token：

1. `hash = sha256(token)`；按 `tokenHash` 查行。查无 → 401。
2. 行 `expiresAt < now` → 401。
3. 行**已撤销**（`revokedAt != null`）→ **判为失窃/重放**：`revokeFamily(familyId)`（撤销该族所有 token）→ 401。这把「攻击者用旧 token 续期」与「合法用户后续用新 token 续期」双双打死，攻击者得不到长期访问，合法用户被迫重登（安全优先）。
4. 正常：`revoke` 旧行（设 `revokedAt`、`replacedById`），`issue(userId, familyId)` 同族新 token，签新 access，返回二者。

## 前端（web + swimmer 对称）

- **auth-store**：由存 `token` 改为存 `accessToken` + `refreshToken`（持久化）；`setAuth`/`clear` 相应调整。
- **axios 拦截器**：响应 401 且非 `/auth/refresh` 自身、且该请求未重试过 → 触发续期：
  - **单飞**：模块级 `refreshPromise`，并发 401 共享同一次 `/auth/refresh`；
  - 成功 → 写回新双 token、重放原请求；失败 → `clear()` + 跳 `/login`。
- **login/claim**：存双 token。**logout**：调 `/auth/logout`（带 refresh）再 `clear()`。

> 续期端点用裸 axios（不经带拦截器的实例）调用，避免递归。

## 配置（`validateEnv` 增项）

| 变量 | 规则 | 默认 |
|---|---|---|
| `JWT_EXPIRES_IN` | 字符串时长 | **`15m`**（原 `1d`）|
| `REFRESH_TOKEN_TTL` | 字符串时长 | `30d` |

`REFRESH_TOKEN_TTL` 解析为毫秒用于 `expiresAt`（用既有/轻量时长解析；如 `30d`/`15m`）。

## 测试策略（TDD）

- **单测**
  - `RefreshTokenService`：`issue` 落库存 hash 而非明文；`rotate` 撤旧+同族签新；`validate` 拒过期/已撤销；**复用（已撤销 token）⇒ 撤族并抛**；`revokeAllForUser` 全撤。
  - `AuthService`：`issueSession` 返双 token；`refresh`/`logout` 编排正确。
- **e2e**（真实库）
  - login → 拿 access+refresh；
  - `/auth/refresh` → 新双 token；**旧 refresh 再用 → 401**；
  - **重放旧 refresh ⇒ 401 且家族失效**（新 token 也连带失效）；
  - `/auth/logout` → 该 refresh 失效；
  - `/auth/logout-all` → 该用户所有会话失效；
  - 既有 auth e2e（register/login/claim）回归：响应体多出 `refreshToken` 不破坏断言（用 `toMatchObject`）。
- **前端**：两端 auth-store 存双 token；拦截器 401→单飞续期→重试（mock 先 401 后 200）；并发 401 只发一次 refresh。

## 安全考量

- refresh 256-bit 高熵、**哈希存储**（sha256）；DB 泄露不暴露可用明文。
- **轮换 + 复用检测**：失窃 refresh 一旦与合法轮换交错即触发撤族。
- **短 access TTL**（15m）压缩失窃 access 的可用窗口。
- **真撤销**：登出/全登出服务端生效（stateless JWT 做不到）。
- `/auth/refresh`、`/auth/logout` 限流；refresh 端点公开但需持有有效 token。
- 既有认领账号接管防御（[[claim-flow-security-invariant]]）不受影响（仍走 `issueSession`）。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| `LoginResponse` 加字段 → 既有 e2e/前端断言 | 仅**增**字段；e2e 用 `toMatchObject`；前端读 `accessToken` 不受影响，另存 `refreshToken` |
| access TTL 1d→15m 改变体验 | 正是 refresh 的目的；两端静默续期对用户无感 |
| 拦截器续期递归/风暴 | 单飞 + 裸 axios 调 refresh + 「已重试」标记 |
| 时长解析（`30d`/`15m`）| 用轻量解析函数并单测边界 |
| 并发轮换竞态（同一 refresh 两请求同时到）| 一个成功轮换、另一个看到已撤销 → 触发撤族（安全侧保守，可接受）|

## 验收标准

- `npm run lint`/`build`(4 包)/`test`/`test:e2e` 全绿，新增单测与 e2e 通过；迁移存在且 `migrate deploy` 干净。
- 登录返回 access+refresh；`/auth/refresh` 轮换可用、旧 token 失效、复用触发撤族；`/auth/logout`、`/auth/logout-all` 服务端生效。
- 两端在 access 过期后静默续期、用户无感；刷新失败回退登录。
- README 鉴权小节更新（双 token、轮换、登出端点、TTL）。
