# OpenAPI / Swagger 文档 — 设计

> API 质量子项目（#4）的**首片 #4a**。把整个接口面变成可浏览/可调试的在线文档。
> **纯增量、零行为变更、无迁移**——仅新增 `/docs`、`/docs-json` 两个路由。

## 背景与目标

现状：无任何接口文档，集成者只能读源码。目标：用 `@nestjs/swagger` 自动产出 OpenAPI 文档，`/docs` 提供 Swagger UI，声明 Bearer 鉴权与 #1 的统一错误信封，覆盖全部控制器。

## 范围与非目标

**范围**：`apps/api`（装 `@nestjs/swagger`、`nest-cli.json` 启用 swagger 插件、`main.ts` 装配、各控制器 `@ApiTags`/`@ApiBearerAuth`、文档化 `ApiErrorResponse`、`validateEnv` 增 `SWAGGER_ENABLED`）、e2e、README。

**非目标**：API 版本化；客户端 SDK 生成；逐端点手写示例 payload（用插件自动推断）；改任何端点行为。

## 设计

### 依赖与自动推断

- 装 `@nestjs/swagger`。
- `nest-cli.json` 加 `compilerOptions.plugins: ["@nestjs/swagger"]`——构建期从 DTO 的 TS 类型 + class-validator 装饰 + JSDoc **自动生成** `@ApiProperty` 与描述，免逐字段手工标注。

### 装配（`main.ts`）

在 `app.listen` 之前：

```ts
if (config.get('SWAGGER_ENABLED') !== 'false') {
  const doc = new DocumentBuilder()
    .setTitle('SwimmingTrace API')
    .setDescription('泳池主控制台 + 游泳者端 API。错误统一返回 ApiErrorResponse 信封。')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
}
```

- 产出 `GET /docs`（Swagger UI）+ `GET /docs-json`（OpenAPI JSON）。
- **门控**：`SWAGGER_ENABLED`（默认非 `'false'` 即开）；可在生产置 `false` 关闭。schema 非机密、端点仍受守卫，故默认开放可接受。

### 标注

- 每个控制器加 `@ApiTags('<name>')`：`auth`/`pools`/`sessions`/`stats`/`places`/`me`/`challenges`/`health`。
- 受 `JwtAuthGuard` 的控制器/路由加 `@ApiBearerAuth()`；公开端点（register/login/refresh/logout/forgot-password/reset-password/verify-email/claim、health）不加。
- 文档化错误信封：在 api 内建一个带 `@ApiProperty` 的 `ApiErrorResponseDto`（结构对齐 `@swim/shared` 的 `ApiErrorResponse`），用 `@ApiExtraModels` + 全局/控制器级 `@ApiResponse({ status: 4xx/5xx, type: ApiErrorResponseDto })` 引用（默认错误响应）。

### 配置（`validateEnv` 增项）

| 变量 | 含义 | 默认 |
|---|---|---|
| `SWAGGER_ENABLED` | `'false'` 关闭 `/docs`；其余视为开 | 开 |

## 测试策略（TDD）

- **e2e**（`docs.e2e-spec.ts`）：
  - `GET /docs-json` → 200，`body.openapi` 存在；`body.paths` 含 `/auth/login`、`/pools`、`/health`；`body.components.securitySchemes` 含 bearer 方案。
  - （断言**路径与安全方案**——由路由/`addBearerAuth` 决定，与 CLI 插件是否在 ts-jest 下生效无关，故稳健。）
  - 既有 e2e 不回归。
- **回归**：现有单测/e2e 保持全绿。

> 注：swagger CLI 插件是 `nest build` 的编译期 transformer；ts-jest（e2e）不应用它，故 e2e 只断言路径/安全方案，不依赖自动推断的 DTO 字段 schema。`nest build`（生产）下字段 schema 完整。

## 风险与兼容性

| 风险 | 处置 |
|---|---|
| `SwaggerModule.createDocument` 在某些循环依赖下报错 | 仅扫描既有控制器，结构简单；构建期验证 |
| 插件在 e2e 下不生效致字段 schema 缺失 | e2e 只断言路径/安全方案；字段 schema 由 `nest build` 保证 |
| `/docs` 暴露 schema | 默认可接受（非机密 + 端点受守卫）；`SWAGGER_ENABLED=false` 可关 |

## 验收标准

- `lint`/`build`(4 包)/`test`/`test:e2e` 全绿，新增 docs e2e 通过。
- `GET /docs` 渲染 Swagger UI；`GET /docs-json` 返回含全部控制器路径、Bearer 安全方案、错误信封 schema 的 OpenAPI 文档。
- `SWAGGER_ENABLED=false` 时 `/docs` 不可用。
- README 增「API 文档」小节（`/docs` 地址 + 关闭开关）。
