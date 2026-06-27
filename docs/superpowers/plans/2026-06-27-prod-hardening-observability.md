# 生产加固与可观测性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/api` 补到可部署、可运维的商业 SaaS 平台基线：安全头、统一错误信封、结构化日志+请求关联、健康探针、配置 fail-fast、优雅关闭、容器化——**不改产品行为、无 DB 迁移**。

**Architecture:** 纯平台层。新增代码集中在 `src/common/`（错误过滤器、日志 reqId 工具）与新建 `src/health/`；错误过滤器经 `APP_FILTER` 注入、日志经 `nestjs-pino` 的 `LoggerModule` 全局中间件、健康检查经 `@nestjs/terminus`。`main.ts` 仅一次性改造装配 helmet/compression/pino/shutdown-hooks/ConfigService。容器化产出 `apps/api/Dockerfile` + 根 `docker-compose.prod.yml`。

**Tech Stack:** NestJS 10、`@nestjs/config`（已在用，扩展既有 `validateEnv`，不引入 Joi）、`nestjs-pino` + `pino` + `pino-pretty`、`@nestjs/terminus`、`helmet`、`compression`、Docker 多阶段。

## Global Constraints

- 不新增任何产品端点、不改既有端点行为/状态码（仅错误响应体形状变化 + 新增 `/health`、`/health/ready`）。
- 无数据库 schema 变更、无 Prisma 迁移。
- 沿用既有手写 `validateEnv` 模式扩展配置校验；**不引入 Joi**。
- 前端不改动（错误信封是 Nest 默认错误体 `{statusCode,message,error}` 的超集，向后兼容）。
- 错误响应体绝不含异常 stack；5xx 的完整 stack 仅写日志。
- `JWT_SECRET` 强校验语义保持：缺失/占位 `change-me-in-prod`/`<16` 即 fail-fast。
- 现有 116 测试保持全绿；新增单测/e2e 通过。
- TDD：先写失败测试 → 跑红 → 最小实现 → 跑绿 → 提交。频繁提交。

---

### Task 1: 扩展启动期环境校验（`validateEnv`）

**Files:**
- Modify: `apps/api/src/common/env.validation.ts`
- Test: `apps/api/src/common/env.validation.spec.ts`

**Interfaces:**
- Consumes: 既有 `validateEnv(config) -> config`、导出常量 `WEAK_JWT_SECRET`。
- Produces: `validateEnv` 现额外校验 `NODE_ENV`(enum)、`LOG_LEVEL`(enum)、`PORT`(数字串)，并对 `NODE_ENV/LOG_LEVEL/PORT/CORS_ORIGIN/SWIMMER_APP_URL/APP_TIMEZONE` 回填默认值后返回（返回对象即 `ConfigService` 数据源）。

- [ ] **Step 1: 追加失败测试**（在现有 spec 末尾追加）

```ts
import { validateEnv } from './env.validation';

const base = { JWT_SECRET: 'a-strong-secret-0123456789', DATABASE_URL: 'postgresql://x' };

it('回填默认值（PORT/APP_TIMEZONE/LOG_LEVEL/NODE_ENV/CORS_ORIGIN）', () => {
  const out = validateEnv({ ...base });
  expect(out.PORT).toBe('3000');
  expect(out.APP_TIMEZONE).toBe('UTC');
  expect(out.LOG_LEVEL).toBe('info');
  expect(out.NODE_ENV).toBe('development');
  expect(out.CORS_ORIGIN).toBe('http://localhost:5173');
});

it('保留显式提供的值', () => {
  const out = validateEnv({ ...base, PORT: '8080', APP_TIMEZONE: 'Asia/Shanghai', NODE_ENV: 'production' });
  expect(out.PORT).toBe('8080');
  expect(out.APP_TIMEZONE).toBe('Asia/Shanghai');
  expect(out.NODE_ENV).toBe('production');
});

it('非法 NODE_ENV / LOG_LEVEL / PORT 抛错', () => {
  expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  expect(() => validateEnv({ ...base, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @swim/api -- env.validation`
Expected: FAIL（新断言不通过——默认值未回填）。

- [ ] **Step 3: 扩展 `validateEnv`**（保留既有 JWT/DATABASE_URL 校验，追加如下）

在文件顶部常量区加：
```ts
const NODE_ENVS = ['development', 'test', 'production'];
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
```
把 `return config;` 替换为：
```ts
  const nodeEnv = (config.NODE_ENV as string) ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}; got "${nodeEnv}".`);
  }
  const logLevel = (config.LOG_LEVEL as string) ?? 'info';
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}; got "${logLevel}".`);
  }
  const port = String((config.PORT as string) ?? '3000');
  if (!/^\d+$/.test(port)) {
    throw new Error(`PORT must be a positive integer; got "${port}".`);
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    PORT: port,
    CORS_ORIGIN: (config.CORS_ORIGIN as string) ?? 'http://localhost:5173',
    SWIMMER_APP_URL: (config.SWIMMER_APP_URL as string) ?? 'http://localhost:5174',
    APP_TIMEZONE: (config.APP_TIMEZONE as string) ?? 'UTC',
  };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -w @swim/api -- env.validation`
Expected: PASS（含既有 JWT/DATABASE_URL 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/common/env.validation.ts apps/api/src/common/env.validation.spec.ts
git commit -m 'feat(api): 扩展 validateEnv 覆盖全部环境变量并回填默认值'
```

---

### Task 2: 统一错误信封（shared 类型 + 全局过滤器）

**Files:**
- Modify: `packages/shared/src/index.ts`（追加 `ApiErrorResponse`）
- Create: `apps/api/src/common/filters/all-exceptions.filter.ts`
- Test: `apps/api/src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `apps/api/src/app.module.ts`（`APP_FILTER` 注入）

**Interfaces:**
- Consumes: `ApiErrorResponse`（shared）、express `Request/Response`、请求上的 `req.id`（由 Task 3 的 pino-http 注入；过滤器读不到时回退 `'unknown'`）。
- Produces: 全局 `AllExceptionsFilter`，把任意异常映射为 `ApiErrorResponse` 并按状态码分级记日志。

- [ ] **Step 1: 在 `packages/shared/src/index.ts` 追加类型**

```ts
/** 统一错误响应信封（所有 API 错误） */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
}
```

- [ ] **Step 2: 写过滤器失败测试** `all-exceptions.filter.spec.ts`

```ts
import { AllExceptionsFilter } from './all-exceptions.filter';
import { BadRequestException, ArgumentsHost } from '@nestjs/common';

function mockHost(method = 'GET', url = '/x', id = 'req-123') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const req = { method, url, id };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('HttpException → 正确 status + 信封字段齐全', () => {
    const { host, status, json } = mockHost();
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 400, message: 'bad input', requestId: 'req-123', path: '/x' });
    expect(typeof body.timestamp).toBe('string');
    expect(body.error).toBeTruthy();
  });

  it('class-validator 数组 message 透传', () => {
    const { host, json } = mockHost();
    filter.catch(new BadRequestException({ message: ['a must be a string', 'b is required'], error: 'Bad Request', statusCode: 400 }), host);
    expect(json.mock.calls[0][0].message).toEqual(['a must be a string', 'b is required']);
  });

  it('未知 Error → 500 + 通用 message + 含 requestId 且不含 stack', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('boom secret stack'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(body.requestId).toBe('req-123');
    expect(JSON.stringify(body)).not.toContain('secret stack');
  });

  it('req.id 缺失时回退 unknown', () => {
    const json = jest.fn();
    const host = { switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json }) }), getRequest: () => ({ method: 'GET', url: '/y' }) }) } as unknown as ArgumentsHost;
    filter.catch(new Error('x'), host);
    expect(json.mock.calls[0][0].requestId).toBe('unknown');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -w @swim/api -- all-exceptions`
Expected: FAIL（`Cannot find module './all-exceptions.filter'`）。

- [ ] **Step 4: 实现过滤器** `all-exceptions.filter.ts`

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorResponse } from '@swim/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = req.id ?? 'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
        error = exception.name.replace(/Exception$/, '');
      } else if (resp && typeof resp === 'object') {
        const r = resp as { message?: string | string[]; error?: string };
        message = r.message ?? message;
        error = r.error ?? exception.name.replace(/Exception$/, '');
      }
    }

    const body: ApiErrorResponse = {
      statusCode: status,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status} [${requestId}]`);
    }

    res.status(status).json(body);
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -w @swim/api -- all-exceptions`
Expected: PASS（4 用例）。

- [ ] **Step 6: 全局注入过滤器**（`app.module.ts`）

`import { APP_GUARD } ...` 改为 `import { APP_FILTER, APP_GUARD } from '@nestjs/core';`，加 `import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';`，在 `providers` 数组追加：
```ts
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
```

- [ ] **Step 7: 构建确认装配无误**

Run: `npm run build -w @swim/shared && npm run build -w @swim/api`
Expected: 成功。

- [ ] **Step 8: 提交**

```bash
git add packages/shared/src/index.ts apps/api/src/common/filters apps/api/src/app.module.ts
git commit -m 'feat(api): 统一错误信封 + 全局异常过滤器（ApiErrorResponse）'
```

---

### Task 3: 结构化日志 + 请求关联（nestjs-pino）

**Files:**
- Modify: `apps/api/package.json`（deps）
- Create: `apps/api/src/common/logging/req-id.ts`
- Test: `apps/api/src/common/logging/req-id.spec.ts`
- Modify: `apps/api/src/app.module.ts`（`LoggerModule.forRoot`）

**Interfaces:**
- Produces: `genReqId(req, res) -> string`（优先回显入站 `x-request-id`，否则生成 UUID，并写回响应头）。`LoggerModule` 全局装配 pino-http；过滤器读到的 `req.id` 由此而来。

- [ ] **Step 1: 安装依赖**

Run: `npm i -w @swim/api nestjs-pino pino pino-pretty`
Expected: 写入 `apps/api/package.json` 依赖。

- [ ] **Step 2: 写 reqId 失败测试** `req-id.spec.ts`

```ts
import { genReqId } from './req-id';

function mk(headers: Record<string, unknown> = {}) {
  const setHeader = jest.fn();
  return { req: { headers } as never, res: { setHeader } as never, setHeader };
}

describe('genReqId', () => {
  it('回显入站 x-request-id 并写响应头', () => {
    const { req, res, setHeader } = mk({ 'x-request-id': 'abc-1' });
    expect(genReqId(req, res)).toBe('abc-1');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-1');
  });

  it('入站缺失时生成非空 id 并写响应头', () => {
    const { req, res, setHeader } = mk();
    const id = genReqId(req, res);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -w @swim/api -- req-id`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现** `req-id.ts`

```ts
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/** 优先回显入站 x-request-id，否则生成 UUID；并把最终 id 写回响应头。 */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -w @swim/api -- req-id`
Expected: PASS。

- [ ] **Step 6: 装配 `LoggerModule`**（`app.module.ts`）

加 `import { LoggerModule } from 'nestjs-pino';` 与 `import { genReqId } from './common/logging/req-id';`，在 `imports` 数组**最前**（`ConfigModule.forRoot` 之后）加：
```ts
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId,
        customProps: (req) => ({ requestId: (req as { id?: string }).id }),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: true,
        customLogLevel: (req, res, err) => {
          if (req.url?.startsWith('/health')) return 'debug';
          if (res.statusCode >= 500 || err) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
```

- [ ] **Step 7: 构建 + 单测全绿**

Run: `npm run build -w @swim/api && npm test -w @swim/api`
Expected: 成功（pino 中间件在 e2e/Task 6 验证 header）。

- [ ] **Step 8: 提交**

```bash
git add apps/api/package.json apps/api/src/common/logging apps/api/src/app.module.ts ../../package-lock.json
git commit -m 'feat(api): nestjs-pino 结构化日志 + x-request-id 关联'
```

---

### Task 4: 健康探针（@nestjs/terminus）

**Files:**
- Modify: `apps/api/package.json`（dep）
- Create: `apps/api/src/health/prisma.health.ts`
- Test: `apps/api/src/health/prisma.health.spec.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/src/app.module.ts`（import `HealthModule`）

**Interfaces:**
- Consumes: 全局 `PrismaService`（`@Global`）。
- Produces: `GET /health`（liveness，`{ status: 'ok' }`，不碰库）；`GET /health/ready`（readiness，`SELECT 1`，503 if down）；二者 `@SkipThrottle()`。`PrismaHealthIndicator.isHealthy(key)`。

- [ ] **Step 1: 安装依赖**

Run: `npm i -w @swim/api @nestjs/terminus`

- [ ] **Step 2: 写指示器失败测试** `prisma.health.spec.ts`

```ts
import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  it('查询成功 → up', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never;
    const ind = new PrismaHealthIndicator(prisma);
    await expect(ind.isHealthy('database')).resolves.toEqual({ database: { status: 'up' } });
  });

  it('查询失败 → 抛 HealthCheckError', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) } as never;
    const ind = new PrismaHealthIndicator(prisma);
    await expect(ind.isHealthy('database')).rejects.toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -w @swim/api -- prisma.health`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现指示器** `prisma.health.ts`

```ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (e) {
      throw new HealthCheckError('Prisma check failed', this.getStatus(key, false, { message: (e as Error).message }));
    }
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -w @swim/api -- prisma.health`
Expected: PASS。

- [ ] **Step 6: 控制器 + 模块**

`health.controller.ts`：
```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaHealthIndicator } from './prisma.health';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.prismaIndicator.isHealthy('database')]);
  }
}
```
`health.module.ts`：
```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
```
`app.module.ts`：`import { HealthModule } from './health/health.module';` 并加入 `imports`。

- [ ] **Step 7: 构建 + 单测全绿**

Run: `npm run build -w @swim/api && npm test -w @swim/api`
Expected: 成功。

- [ ] **Step 8: 提交**

```bash
git add apps/api/package.json apps/api/src/health apps/api/src/app.module.ts ../../package-lock.json
git commit -m 'feat(api): /health 存活 + /health/ready 就绪探针（terminus + Prisma）'
```

---

### Task 5: bootstrap 装配 — 安全头/压缩/pino/优雅关闭/Config

**Files:**
- Modify: `apps/api/package.json`（helmet/compression）
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/prisma.service.ts`（`OnModuleDestroy`）
- Modify: `apps/api/src/stats/stats.service.ts`（注入 `ConfigService` 读 `APP_TIMEZONE`）
- Test: `apps/api/src/stats/stats.service.spec.ts`（补 `ConfigService` provider）

**Interfaces:**
- Consumes: `Logger`（nestjs-pino）、`ConfigService`、`AllExceptionsFilter`（已由 APP_FILTER 注入，无需 main 再挂）。
- Produces: 生产化的 `bootstrap()`；`PrismaService` 优雅断连；`stats` 不再直读 `process.env`。

- [ ] **Step 1: 安装依赖**

Run: `npm i -w @swim/api helmet compression && npm i -D -w @swim/api @types/compression`

- [ ] **Step 2: 改造 `main.ts`**（整体替换）

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(compression());

  // Strip unknown props, transform payloads to DTO types.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Graceful shutdown: SIGTERM/SIGINT → onModuleDestroy → Prisma $disconnect.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  await app.listen(config.get<string>('PORT') ?? '3000');
}
bootstrap();
```

- [ ] **Step 3: `prisma.service.ts` 加优雅断连**

把类签名改为 `implements OnModuleInit, OnModuleDestroy`（import 补 `OnModuleDestroy`），并加：
```ts
  async onModuleDestroy() {
    await this.$disconnect();
  }
```

- [ ] **Step 4: `stats.service.ts` 改走 ConfigService**

- import 加 `import { ConfigService } from '@nestjs/config';`
- 构造函数改为 `constructor(private prisma: PrismaService, private config: ConfigService) {}`
- 把 `const tz = process.env.APP_TIMEZONE ?? 'UTC';` 改为 `const tz = this.config.get<string>('APP_TIMEZONE') ?? 'UTC';`

- [ ] **Step 5: 修 `stats.service.spec.ts`**

在该 spec 的 `Test.createTestingModule({ providers: [...] })` 的 providers 数组补：
```ts
    { provide: ConfigService, useValue: { get: (k: string) => (k === 'APP_TIMEZONE' ? 'UTC' : undefined) } },
```
并 `import { ConfigService } from '@nestjs/config';`。（若 stats 单测以别的方式实例化 service，则相应注入同形 stub。）

- [ ] **Step 6: 构建 + 全量单测**

Run: `npm run build -w @swim/api && npm test -w @swim/api`
Expected: PASS（stats 单测在注入 stub 后通过）。

- [ ] **Step 7: 提交**

```bash
git add apps/api/package.json apps/api/src/main.ts apps/api/src/prisma.service.ts apps/api/src/stats ../../package-lock.json
git commit -m 'feat(api): bootstrap 装配 helmet/compression/pino/优雅关闭 + 配置集中化'
```

---

### Task 6: e2e — 健康 / 错误信封 / 请求关联

**Files:**
- Create: `apps/api/test/platform.e2e-spec.ts`
- (按需) Modify: 任何断言旧错误体形状的既有 e2e

**Interfaces:**
- Consumes: 完整 `AppModule`（含 APP_FILTER、LoggerModule、HealthModule）。
- Produces: 平台层 e2e 覆盖。

- [ ] **Step 1: 写 e2e**（bootstrap 部分**照搬**某个既有 `apps/api/test/*.e2e-spec.ts` 的 app 初始化：`Test.createTestingModule({ imports: [AppModule] })` → `createNestApplication()` → `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))` → `await app.init()`；末尾 `afterAll(() => app.close())`）

测试体：
```ts
import request from 'supertest';

describe('Platform (e2e)', () => {
  // ...app 初始化同既有 e2e...

  it('GET /health → 200 {status:ok}，无需鉴权', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready → 200，库在线', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('未知路由 → 404 信封，含 path + requestId', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/no-such-route' });
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.length).toBeGreaterThan(0);
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('未鉴权访问受保护路由 → 401 信封', async () => {
    const res = await request(app.getHttpServer()).get('/pools');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, path: '/pools' });
    expect(res.body.requestId).toBeTruthy();
  });

  it('回显入站 x-request-id', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('x-request-id', 'trace-xyz');
    expect(res.headers['x-request-id']).toBe('trace-xyz');
  });
});
```

- [ ] **Step 2: 跑 e2e**

Run: `npm run test:e2e`
Expected: 新文件全绿；既有 e2e 仍全绿。若某既有 e2e 因断言旧错误体形状（如直接 `expect(res.body).toEqual({message,...})`）而红，改为 `toMatchObject` 仅断言关心字段（`message`/`statusCode` 仍在）。

- [ ] **Step 3: 提交**

```bash
git add apps/api/test
git commit -m 'test(api): 平台层 e2e（health/错误信封/x-request-id）'
```

---

### Task 7: 容器化（Dockerfile + 生产 compose）

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore`（仓库根）
- Create: `docker-compose.prod.yml`（仓库根）
- Modify: 根 `package.json`（`prod:up`/`prod:down`）
- Modify: `apps/api/.env.example`（`NODE_ENV`/`LOG_LEVEL`）

**Interfaces:**
- Produces: 可构建的 API 生产镜像 + `db+api` compose；构建上下文 = 仓库根。

- [ ] **Step 1: `apps/api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# 构建上下文 = 仓库根（见 docker-compose.prod.yml 的 build.context）
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @swim/shared && npm run build -w @swim/api && npx -w @swim/api prisma generate

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/prisma apps/api/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma node_modules/@prisma
USER node
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2: `.dockerignore`（根）**

```
**/node_modules
**/dist
.git
.github
docs
apps/web
apps/swimmer
**/.env
**/*.spec.ts
**/*.test.ts
apps/api/test
```

- [ ] **Step 3: `docker-compose.prod.yml`（根）**

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-swim}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-swim}
      POSTGRES_DB: ${POSTGRES_DB:-swim}
    volumes:
      - swim-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-swim}']
      interval: 10s
      timeout: 5s
      retries: 10
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql://swim:swim@db:5432/swim?schema=public}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:5173}
      SWIMMER_APP_URL: ${SWIMMER_APP_URL:-http://localhost:5174}
      NODE_ENV: production
      LOG_LEVEL: ${LOG_LEVEL:-info}
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy
    ports:
      - '3000:3000'
volumes:
  swim-db-data:
```

- [ ] **Step 4: 根 `package.json` 加脚本**

在 `scripts` 追加：
```json
    "prod:up": "docker compose -f docker-compose.prod.yml up -d --build",
    "prod:down": "docker compose -f docker-compose.prod.yml down"
```

- [ ] **Step 5: `apps/api/.env.example` 补两项**（追加）

```
# 运行环境与日志级别（生产置 production）
NODE_ENV=development
LOG_LEVEL=info
```

- [ ] **Step 6: 构建镜像验证**

Run: `docker build -f apps/api/Dockerfile -t swim-api:test .`
Expected: 构建成功（如路径/引擎报错按需微调 COPY 行）。若本机 Docker 资源受限，至少完成 builder 阶段并记录。

- [ ] **Step 7: 提交**

```bash
git add apps/api/Dockerfile .dockerignore docker-compose.prod.yml package.json apps/api/.env.example
git commit -m 'feat(ops): API 多阶段 Dockerfile + 生产 docker-compose（api+postgis）'
```

---

### Task 8: 终验 — 全量门禁 + README + 自评审 + 通知

**Files:**
- Modify: `README.md`（新增「生产部署与运维」小节；更新接口一览加 `/health*`）

- [ ] **Step 1: 全量门禁**

Run: `npm run lint && npm run build && npm test && npm run test:e2e`
Expected: 全绿（lint 0 / build 4 包 / 单测含新增 / e2e 含 platform）。逐个修复直至绿。

- [ ] **Step 2: 实跑探针**（本地起 api 后）

Run: `curl -s localhost:3000/health` 与 `curl -s -i localhost:3000/health/ready`
Expected: `{"status":"ok"}`；ready 200；响应头含 `x-request-id`。

- [ ] **Step 3: README 增「生产部署与运维」小节**

覆盖：环境变量校验（fail-fast 列表）、`/health`、`/health/ready` 用途、`npm run prod:up`/`prod:down`、镜像分层说明、`x-request-id` 关联排错；接口一览表加 `GET /health`、`GET /health/ready`（公开）。

- [ ] **Step 4: 自评审**（fresh eyes）

核对：错误体不含 stack；health 公开且免限流；日志脱敏 Authorization；`enableShutdownHooks` 生效；无直读 `process.env` 残留（`grep -rn "process.env" apps/api/src` 仅余 LoggerModule 的 bootstrap 配置）。

- [ ] **Step 5: 提交 + 通知验收**

```bash
git add README.md
git commit -m 'docs: 生产部署与运维（健康探针/容器化/请求关联排错）'
```
通知用户：#1 完成 + 全量门禁绿 + 变更摘要 + 后续子项目（#2 认证生命周期 / #3 计费 …）。

## Self-Review（plan vs spec）

- **Spec coverage**：helmet/compression(T5) · 错误信封+filter(T2) · pino+reqId(T3) · health(T4) · 配置校验/集中化(T1,T5) · 优雅关闭(T5) · 容器化(T7) · 测试(T1-6) · README(T8) —— 全覆盖。
- **Placeholder scan**：无 TODO/TBD；每步含实际代码或精确命令。e2e/stats-spec 两处「照搬既有写法」给出了明确套用规则（同形 stub / 镜像既有 bootstrap），非占位。
- **Type consistency**：`ApiErrorResponse` 字段（statusCode/error/message/requestId/timestamp/path）在 T2 定义并在 filter 与 e2e 断言一致；`genReqId(req,res)`、`PrismaHealthIndicator.isHealthy(key)` 跨任务签名一致。
- **Deviations from spec（已在 spec 同步）**：① 配置用扩展 `validateEnv` 而非 Joi；② 前端不改（信封超集，向后兼容）。
