# OpenAPI / Swagger 文档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@nestjs/swagger` 把全部接口自动生成 OpenAPI 文档，`/docs` 提供 Swagger UI、声明 Bearer 鉴权与统一错误信封；`SWAGGER_ENABLED=false` 可关。

**Architecture:** 抽 `setupSwagger(app)` 助手（main.ts 与 e2e 共用，便于测试）；`nest-cli.json` 启用 swagger 插件做编译期字段推断；控制器加 `@ApiTags`/`@ApiBearerAuth`；`ApiErrorResponseDto` 进 components.schemas。纯增量、无迁移。

**Tech Stack:** NestJS 10 · @nestjs/swagger · supertest e2e。

## Global Constraints

- 零端点行为变更；仅新增 `GET /docs`（UI）+ `GET /docs-json`（OpenAPI JSON）。
- `SWAGGER_ENABLED !== 'false'` 即开（默认开）；经 `...config` 透传，**无需改 validateEnv**。
- swagger CLI 插件仅 `nest build` 编译期生效；e2e（ts-jest）只断言路径/安全方案/标签，不依赖插件推断的字段 schema。
- 现有 104 单测 / 21 e2e 不回归；TDD：红→绿→提交。

---

### Task 1: 依赖 + 插件 + `setupSwagger` + main 装配 + 路径 e2e

**Files:**
- Modify: `apps/api/package.json`（dep）
- Modify: `apps/api/nest-cli.json`（plugin）
- Create: `apps/api/src/swagger.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/test/docs.e2e-spec.ts`

**Interfaces:**
- Produces: `setupSwagger(app: INestApplication): void` —— 构建 OpenAPI 文档并挂到 `/docs`、`/docs-json`。

- [ ] **Step 1: 安装依赖** — `npm i -w @swim/api @nestjs/swagger`

- [ ] **Step 2: 写失败 e2e** `apps/api/test/docs.e2e-spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger';

describe('OpenAPI docs (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    setupSwagger(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('/docs-json 暴露 OpenAPI（路径 + Bearer 安全方案）', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.openapi).toBeTruthy();
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/auth/login', '/pools', '/health']));
    expect(res.body.components?.securitySchemes).toHaveProperty('bearer');
  });
});
```

- [ ] **Step 3: 跑测试确认失败** — `npm run test:e2e` → FAIL（`Cannot find module '../src/swagger'`）。

- [ ] **Step 4: 实现** `apps/api/src/swagger.ts`

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SwimmingTrace API')
    .setDescription('泳池主控制台 + 游泳者端 API。错误统一返回 ApiErrorResponse 信封。')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
```

- [ ] **Step 5: 接进 `main.ts`** —— import `setupSwagger`，在 `app.enableCors(...)` 之后、`app.listen(...)` 之前加：

```ts
  if (config.get<string>('SWAGGER_ENABLED') !== 'false') {
    setupSwagger(app);
  }
```

- [ ] **Step 6: 启用 swagger 插件** —— `nest-cli.json` 改为：

```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src", "compilerOptions": { "plugins": ["@nestjs/swagger"] } }
```

- [ ] **Step 7: 跑 e2e + 构建** — `npm run test:e2e`（docs e2e 绿）+ `npm run build -w @swim/api`（插件编译通过）。

- [ ] **Step 8: 提交**

```bash
git add apps/api/package.json ../../package-lock.json apps/api/nest-cli.json apps/api/src/swagger.ts apps/api/src/main.ts apps/api/test/docs.e2e-spec.ts
git commit -m 'feat(api): OpenAPI/Swagger 文档（/docs + /docs-json，SWAGGER_ENABLED 门控）'
```

---

### Task 2: 控制器标注 + 错误信封 schema

**Files:**
- Create: `apps/api/src/common/api-error.dto.ts`
- Modify: `apps/api/src/swagger.ts`（extraModels 注册错误 DTO）
- Modify: 各控制器（`@ApiTags` + `@ApiBearerAuth`）
- Modify: `apps/api/test/docs.e2e-spec.ts`（加标签 + 错误 schema 断言）

**Interfaces:**
- Consumes: `setupSwagger`。
- Produces: `ApiErrorResponseDto`（带 `@ApiProperty` 的错误信封，进 components.schemas）。

- [ ] **Step 1: 扩展 e2e 断言**（`docs.e2e-spec.ts` 加一条）

```ts
  it('路径带标签、受保护路径声明 Bearer、错误信封进 schema', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.paths['/pools'].get.tags).toContain('pools');
    expect(res.body.paths['/pools'].get.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(res.body.components.schemas).toHaveProperty('ApiErrorResponseDto');
  });
```

- [ ] **Step 2: 跑测试确认失败** — `npm run test:e2e` → 新断言 FAIL（无 tags/security/schema）。

- [ ] **Step 3: 错误 DTO** `apps/api/src/common/api-error.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';

/** OpenAPI 文档用：对齐 @swim/shared 的 ApiErrorResponse（全局异常过滤器返回）。 */
export class ApiErrorResponseDto {
  @ApiProperty() statusCode: number;
  @ApiProperty() error: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message: string | string[];
  @ApiProperty() requestId: string;
  @ApiProperty() timestamp: string;
  @ApiProperty() path: string;
}
```

- [ ] **Step 4: swagger.ts 注册错误 DTO**（确保进 components.schemas）—— 把 `createDocument` 行改为：

```ts
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ApiErrorResponseDto] });
```
并 `import { ApiErrorResponseDto } from './common/api-error.dto';`、`import { getSchemaPath } from '@nestjs/swagger';`（如需）。`extraModels` 强制该模型进 `components.schemas`。

- [ ] **Step 5: 控制器标注**（每个控制器类加装饰器，import 自 `@nestjs/swagger`）

- `auth.controller.ts`：类加 `@ApiTags('auth')`；`me`、`logoutAll`、`resendVerification` 三个受 `JwtAuthGuard` 的方法各加 `@ApiBearerAuth()`。
- `pools.controller.ts`：`@ApiTags('pools')` + `@ApiBearerAuth()`（类级）。
- `sessions.controller.ts`：`@ApiTags('sessions')` + `@ApiBearerAuth()`。
- `stats.controller.ts`：`@ApiTags('stats')` + `@ApiBearerAuth()`。
- `places.controller.ts`：`@ApiTags('places')` + `@ApiBearerAuth()`。
- `me.controller.ts`：`@ApiTags('me')` + `@ApiBearerAuth()`。
- `challenges.controller.ts`：`@ApiTags('challenges')` + `@ApiBearerAuth()`。
- `health.controller.ts`：`@ApiTags('health')`（公开，不加 Bearer）。

> `@ApiBearerAuth()` 默认引用名 `bearer`，与 `addBearerAuth()` 一致。

- [ ] **Step 6: 跑 e2e + 构建** — `npm run test:e2e`（两条 docs 断言绿）+ `npm run build -w @swim/api`。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/common/api-error.dto.ts apps/api/src/swagger.ts apps/api/src/auth/auth.controller.ts apps/api/src/pools/pools.controller.ts apps/api/src/sessions/sessions.controller.ts apps/api/src/stats/stats.controller.ts apps/api/src/places/places.controller.ts apps/api/src/me/me.controller.ts apps/api/src/challenges/challenges.controller.ts apps/api/src/health/health.controller.ts apps/api/test/docs.e2e-spec.ts
git commit -m 'feat(api): 控制器 @ApiTags/@ApiBearerAuth + 错误信封 schema'
```

---

### Task 3: 终验 + README + 自评审 + 通知

**Files:**
- Modify: `README.md` · `apps/api/.env.example`

- [ ] **Step 1: 全量门禁** — `npm run lint && npm run build && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 2: 实跑**（本地起 api）：浏览器开 `http://localhost:3000/docs` 见 Swagger UI；`curl -s localhost:3000/docs-json | head` 见 OpenAPI JSON；设 `SWAGGER_ENABLED=false` 重启后 `/docs` 404。

- [ ] **Step 3: .env.example** — 加 `# 置 false 关闭 /docs（默认开）` + `SWAGGER_ENABLED=true`。

- [ ] **Step 4: README** — 增「API 文档」小节：`/docs`（Swagger UI）+ `/docs-json`（OpenAPI）、Bearer 鉴权、`SWAGGER_ENABLED=false` 关闭。

- [ ] **Step 5: 自评审** — `/docs` 可浏览；`/docs-json` 含全部控制器路径 + bearer 方案 + 错误 schema；门控生效；既有测试全过。

- [ ] **Step 6: 提交 + 通知**

```bash
git add README.md apps/api/.env.example
git commit -m 'docs: API 文档（/docs Swagger UI）'
```
通知用户 #4a 完成 + 全量门禁绿 + 剩 #4b（分页）/#4c（幂等）/#4d（API keys）。

## Self-Review（plan vs spec）

- **Spec coverage**：依赖+插件(T1) · setupSwagger+main 装配+门控(T1) · 控制器标注(T2) · 错误信封 schema(T2) · e2e(T1/T2) · README/.env(T3) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；每步含完整代码/命令。
- **Type consistency**：`setupSwagger(app)`、`ApiErrorResponseDto` 字段对齐 `@swim/shared` 的 `ApiErrorResponse`、`@ApiBearerAuth` 名 `bearer` 与 `addBearerAuth()` 一致。
- **偏差（优于/简化 spec）**：① 抽 `setupSwagger` 助手（spec 内联 main.ts）以便 e2e 共用；② `SWAGGER_ENABLED` 不改 validateEnv（`...config` 已透传）。
- **风险**：插件在 e2e 下不生效 → e2e 只断言路径/标签/安全/错误 schema（均与插件无关）。
