# 生产加固与可观测性（Production Hardening & Observability）— 设计

> 商业 SaaS 化路线的**子项目 #1**。纯平台层加固：**不改任何产品行为、不动数据库 schema**。
> 对外可见的变化仅两处：① 所有错误响应体统一为标准信封；② 新增 `/health`、`/health/ready` 探针路由。

## 背景与目标

`apps/api` 的产品逻辑已成熟（Phase 1 + Phase 2 A/B/C/D，116 测试全绿），但平台层很薄：
`main.ts` 仅 `ValidationPipe` + CORS；无安全头、无统一错误契约、无结构化日志、无健康探针、无优雅关闭、无环境变量 schema 校验、无应用容器。本子项目把后端补到**可部署、可运维**的商业 SaaS 基线。

**目标**

1. 安全基线：`helmet` 安全响应头 + `compression`。
2. 统一错误契约：全局异常过滤器 → 标准 JSON 错误信封（含 `requestId`），类型导出到 `@swim/shared`，两端前端复用。
3. 可观测：`nestjs-pino` 结构化日志 + 每请求 `x-request-id` 关联；`/health`（存活）、`/health/ready`（就绪，探库）。
4. 配置硬化：扩展既有 `validateEnv`（项目既定的手写校验模式）覆盖全部环境变量并回填默认值，启动期 fail-fast；集中取代散落的 `process.env.X ?? …` 读取。
5. 生命周期：`enableShutdownHooks()` + Prisma 优雅断连。
6. 容器化：`apps/api` 多阶段 `Dockerfile` + 根 `docker-compose.prod.yml`（api + postgis）。

## 范围与非目标

**范围**：仅 `apps/api`（含 `@swim/shared` 加一个错误信封类型）、新增 Docker 资产、`.env.example` 增项、README/CI 文档化。前端无需改动（信封向后兼容，见 §2）。

**非目标（明确不做，留给后续子项目）**

- Sentry / Prometheus 指标 / 审计日志 → 子项目 #5。
- refresh token / 密码重置 / 邮件 → 子项目 #2。
- 前端改版、分页、新增任何产品端点。
- 除「错误响应体形状」与「新增 `/health*`」外，**不改变任何既有端点的行为/状态码**。
- 无数据库迁移（无 schema 变更）。

## 架构与落点

`main.ts` bootstrap 顺序（其余不变）：

```
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));            // nestjs-pino 接管 Nest 日志
app.use(helmet());
app.use(compression());
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));  // 不变
app.useGlobalFilters(app.get(AllExceptionsFilter));                            // 统一信封
app.enableShutdownHooks();
const config = app.get(ConfigService);
app.enableCors({ origin: <从 ConfigService 取>, credentials: true });
await app.listen(config.get<number>('PORT'));
```

新增代码集中在既有 `src/common/` 与新建 `src/health/`，模块装配进 `AppModule`：

```
apps/api/src/
├─ common/
│  ├─ filters/all-exceptions.filter.ts   # 全局异常 → 标准信封
│  └─ logging/                            # （pino 配置就近，或直接在 AppModule 装配 LoggerModule）
├─ config/
│  └─ env.validation.ts                  # Joi schema（供 ConfigModule.forRoot 使用）
├─ health/
│  ├─ health.module.ts
│  └─ health.controller.ts               # /health, /health/ready
└─ main.ts                               # bootstrap 改造
```

## 组件设计

### 1. 配置校验（扩展既有 `validateEnv`）

项目已装配 `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`，`common/env.validation.ts` 已校验 `JWT_SECRET`/`DATABASE_URL`。**沿用该手写模式**（不引入 Joi，避免替换已测通过的代码），把 `validateEnv` 扩展为覆盖下列全部变量、非法即抛错、并对可选项回填默认值（其返回对象即 `ConfigService` 的数据源）：

| 变量 | 规则 |
|---|---|
| `NODE_ENV` | `development\|test\|production`，默认 `development` |
| `PORT` | number，默认 `3000` |
| `DATABASE_URL` | string uri，**required** |
| `JWT_SECRET` | string，**required**，`min(16)`，且禁用占位串（如 `changeme`、`your-secret`） |
| `JWT_EXPIRES_IN` | string，默认 `1d` |
| `CORS_ORIGIN` | string，默认 `http://localhost:5173` |
| `SWIMMER_APP_URL` | string，默认 `http://localhost:5174` |
| `APP_TIMEZONE` | string，默认 `UTC` |
| `LOG_LEVEL` | `fatal\|error\|warn\|info\|debug\|trace`，默认 `info` |

校验失败 → 启动即抛错退出（fail-fast）。`auth`/`jwt.strategy` 已走 `ConfigService`；本子项目再把 `main.ts` 的 `process.env.PORT/CORS_ORIGIN`、`stats.service` 的 `process.env.APP_TIMEZONE` 改走 `ConfigService`，消除服务层直读 `process.env`。JWT 占位/长度强校验语义保持不变（仍由 `validateEnv` 承接）。

### 2. 错误契约（统一信封 + 全局过滤器）

`@swim/shared` 新增：

```ts
export interface ApiErrorResponse {
  statusCode: number;          // HTTP 状态码
  error: string;               // 状态短语，如 "Bad Request"
  message: string | string[];  // 人类可读信息；class-validator 可能是数组
  requestId: string;           // 关联 id（= x-request-id）
  timestamp: string;           // ISO8601
  path: string;                // 请求路径
}
```

`AllExceptionsFilter`（`@Catch()` 全捕获）映射规则：

- `HttpException`：取其 `getStatus()` 与 `getResponse()`。`getResponse()` 为对象时透传其 `message`/`error`；为字符串时作为 `message`。
- 其它未知 `Error`：状态 `500`，`message = 'Internal server error'`，`error = 'Internal Server Error'`；**响应体绝不含 stack**。
- 统一补 `requestId`（从请求上下文取，见 §3）、`timestamp`、`path`。
- 日志：4xx 记 `warn`，5xx 记 `error`（含完整 stack + requestId），经 pino logger，不走 `console`。

前端：信封是 Nest 默认错误体 `{statusCode,message,error}` 的**超集**（只增 `requestId`/`timestamp`/`path`，不删 `message`），两端 axios 拦截器现仅处理 401、调用点读 `message` 不受影响，故**前端无需改动**（YAGNI）。dev 下的 `requestId` 透出留待 #5 可观测子项目按需补。

### 3. 结构化日志与请求关联（`nestjs-pino`）

- `LoggerModule.forRoot`：
  - `level` 取 `LOG_LEVEL`；prod 输出 JSON，dev 用 `pino-pretty`。
  - `genReqId`：优先入站 `x-request-id`，否则生成 UUID；并把该 id 写回响应头 `x-request-id`。
  - `customProps`：每条日志带 `requestId`。
  - `redact`：脱敏 `req.headers.authorization`、`req.headers.cookie`。
  - `autoLogging` + `customLogLevel`：`/health*` 降为 `debug`，避免探针刷屏；5xx 记 `error`。
- `requestId` 经 pino 的 request 上下文获取，供 `AllExceptionsFilter` 读取（通过 `req.id` 或 logger 上下文），保证「日志行 / 错误信封 / 响应头」三处一致。

### 4. 健康探针（`@nestjs/terminus`）

`HealthController`（标 `@Public()` 跳过 JWT 守卫、并跳过限流）：

- `GET /health` —— 存活探针：进程在即 `200 { status: 'ok' }`，**不**碰 DB。
- `GET /health/ready` —— 就绪探针：用 terminus 自定义指示器执行 `prisma.$queryRaw\`SELECT 1\``，成功 `200`，失败 `503`。

### 5. 安全头与压缩

`app.use(helmet())`（默认策略即可，API 无需 CSP 页面策略）+ `app.use(compression())`。CORS 维持既有 allowlist 语义（改从 ConfigService 取值）。

### 6. 生命周期

`app.enableShutdownHooks()`；`PrismaService` 实现 `OnModuleDestroy`/`enableShutdownHooks` 在 `SIGTERM`/`SIGINT` 时 `$disconnect()`，确保容器优雅退出。

### 7. 容器化（API 镜像 + 生产 compose）

`apps/api/Dockerfile`（多阶段，构建上下文 = 仓库根）：

- **builder**（`node:20`）：拷工作区清单 → `npm ci` → 构建 `@swim/shared` 与 `apps/api`（`npm run build`）→ `prisma generate`。
- **runner**（`node:20-slim`）：仅拷 `dist/`、生产 `node_modules`、`apps/api/prisma/`；**非 root** 用户；`EXPOSE 3000`；entrypoint：`npx prisma migrate deploy && node dist/main.js`。

`.dockerignore`（根）排除 `node_modules`、各包 `dist`、`apps/web`、`apps/swimmer`、`.git` 等，缩小上下文。

`docker-compose.prod.yml`（根）：

- `db`：`postgis/postgis:16-3.4`，命名卷持久化，healthcheck（`pg_isready`）。
- `api`：`build` 自上面 Dockerfile，`depends_on: db (condition: service_healthy)`，env 取自根 `.env`，映射 `3000`。

根 `package.json` 加脚本 `prod:up` / `prod:down`（`docker compose -f docker-compose.prod.yml up -d --build` / `down`）。`.env.example` 增 `NODE_ENV=production`、`LOG_LEVEL=info` 注释示例。

## 数据流（一次请求）

1. 入站 → pino 中间件分配/继承 `requestId`，写响应头；记一条 request 日志。
2. 守卫/管道/控制器照常。
3. 抛错 → `AllExceptionsFilter` 捕获 → 组装 `ApiErrorResponse`（带同一 `requestId`）→ 按状态码分级记日志 → 返回信封。
4. 正常 → pino 记完成日志（status/latency/requestId）。

## 测试策略（TDD）

- **单测**
  - `AllExceptionsFilter`：`HttpException` → 正确 status + 信封字段齐全；未知 `Error` → 500 + 通用 message + 含 `requestId` 且**不含 stack**；class-validator 数组 message 透传。
  - Joi env schema：缺 `DATABASE_URL` / `JWT_SECRET` 过短 / 占位串 → 拒绝；合法 → 通过。
- **e2e**（真实库）
  - `GET /health` → 200 `{ status: 'ok' }`，无需鉴权。
  - `GET /health/ready` → 200（库在线）。
  - 未知路由 → 404 信封，含 `path`、`requestId`。
  - 未鉴权访问受保护路由 → 401 信封形状。
  - 断言响应头 `x-request-id` 存在且回显入站值。
- **回归**：现有 116 测试保持全绿。错误信封改了错误响应体形状——逐一核查断言 `.body.message` 的 e2e（Nest 默认本就返回 `{statusCode,message,error}`，本设计只增字段，预期低风险），如有断言旧形状者一并更新。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| 全局过滤器改变错误响应体 → 可能打破断言旧形状的 e2e | `message` 字段保留，仅新增字段；实现期跑全量 e2e 逐个修正 |
| `bufferLogs` + 自定义 logger 装配顺序不当致早期日志丢失 | 按 nestjs-pino 文档 `bufferLogs:true` + `app.useLogger` 标准装配并验证 |
| Docker 多阶段在 monorepo 下 `@swim/shared` 解析 | 构建上下文取仓库根、复用既有 workspace 构建链（`@swim/shared` 已是 built 包）|
| 占位串黑名单误伤合法密钥 | 沿用既有 `WEAK_JWT_SECRET='change-me-in-prod'` 精确匹配 + `min(16)`，不做模糊黑名单 |

## 验收标准

- `npm run lint` / `build`（4 包）/ `test`（api+web+swimmer）/ `test:e2e` 全绿，新增单测与 e2e 通过。
- 启动期：缺失/非法关键环境变量即 fail-fast。
- `GET /health`、`/health/ready` 可用；任意错误返回标准信封且响应头带 `x-request-id`。
- `docker compose -f docker-compose.prod.yml up --build` 能起 api+db，`/health/ready` 返回 200。
- README 增「生产部署与运维」小节；CI 不回归（可选加一步 `docker build` 校验，量力而行）。
