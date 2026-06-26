# OWNER 控制台 Phase 1 · 后端基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有平铺的 NestJS 后端整理成 monorepo（`apps/api`），落地共享类型包（`packages/shared`），并新增一批 owner 作用域的接口（泳池/会员/代录/统计），形成一个有测试覆盖、可独立运行与演示的后端 API。

**Architecture:** npm workspaces monorepo。后端文件按其现有 import 路径归位到 `apps/api/src/`（归位即修复当前编译错误）。新接口全部 `@Roles(OWNER)`，资源级所有权由 `common/ownership.ts` 的两个纯函数 `assertOwnsPool` / `assertOwnsSwimmer` 在 service 层兜底。所有"过 HTTP 的类型"定义在 `packages/shared`，后端 DTO 类 `implements` 这些接口以保持同步。

**Tech Stack:** TypeScript、NestJS 10、Prisma 5、PostgreSQL/PostGIS、Jest + ts-jest（单测，mock Prisma）、supertest（e2e）、bcrypt、class-validator。

## Global Constraints

- Node ≥ 20，NestJS `^10.3`，Prisma `^5.12`（沿用现有 `package.json` 版本，不升级）。
- 不引入 refresh token；沿用现有单 access token（`auth.service` 不动）。
- 所有 NEW 接口：`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.OWNER)`。
- 资源所有权违规一律抛 `ForbiddenException`(403)；资源不存在抛 `NotFoundException`(404)。
- 泳池"删除"= 设 `archivedAt`（软归档）；列表默认 `archivedAt: null`。
- 移除会员 = 设 `Registration.status = 'INACTIVE'`；恢复 = `'ACTIVE'`。
- 建游泳者：随机密码 → `bcrypt.hash(pwd, 12)`，`claimedAt` 不设（默认 null）；**邮箱已存在则复用该 User 并 upsert 其在本池的 Registration 为 ACTIVE，绝不建重复账号**。
- 所有"过 HTTP 的类型"来自 `@swim/shared`（`packages/shared`）；后端响应与 DTO 引用它。
- 单测 mock Prisma，不连库；e2e / `prisma migrate` 需要运行中的 Postgres（实现到该步时再起库）。
- 频繁提交：每个 Task 末尾提交一次。

---

## 文件结构总览

```
swimmingtrace/
├─ package.json                       # 改：workspaces 根
├─ .gitignore                         # 改：补 node_modules / dist / .env
├─ apps/api/
│  ├─ package.json                    # 建：后端依赖 + 脚本 + jest 配置
│  ├─ tsconfig.json                   # 建
│  ├─ tsconfig.build.json             # 建
│  ├─ nest-cli.json                   # 建（原仓库缺失）
│  ├─ prisma/schema.prisma            # 移 + 改（加 archivedAt / claimedAt）
│  └─ src/
│     ├─ main.ts  app.module.ts  prisma.service.ts        # 移
│     ├─ common/
│     │  ├─ auth.common.ts            # 移
│     │  └─ ownership.ts              # 建：assertOwnsPool / assertOwnsSwimmer
│     ├─ auth/{auth.controller,auth.service,auth.module,jwt.strategy}.ts  # 移
│     ├─ pools/{pools.controller,pools.service,pools.module}.ts           # 移 + 改
│     ├─ sessions/{...}.ts            # 移
│     ├─ stats/{stats.controller,stats.service,stats.module}.ts           # 移 + 改
│     └─ places/{...}.ts              # 移
└─ packages/shared/
   ├─ package.json                    # 建
   ├─ tsconfig.json                   # 建
   └─ src/index.ts                    # 建：枚举 + 请求/响应类型
```

---

### Task 1: Monorepo 骨架 + 后端归位 + 编译通过

**Files:**
- Modify: `package.json`（根，改为 workspaces）
- Modify: `.gitignore`
- Create: `apps/api/package.json`、`apps/api/tsconfig.json`、`apps/api/tsconfig.build.json`、`apps/api/nest-cli.json`
- Move（`git mv`）：根目录所有 `.ts` 与 `schema.prisma` → `apps/api/src/...` 与 `apps/api/prisma/`
- Test: 本任务以 `nest build` 成功为验收（无单测）

**Interfaces:**
- Produces: 可编译的 `apps/api`，根 `npm run dev:api` 可启动；后续所有 Task 在 `apps/api` 内工作。

- [ ] **Step 1: 用 git mv 归位后端文件**（保留历史）

```bash
cd /Users/dylan/Documents/veloxis/swimmingtrace
mkdir -p apps/api/src/common apps/api/src/auth apps/api/src/pools \
         apps/api/src/sessions apps/api/src/stats apps/api/src/places apps/api/prisma

git mv main.ts app.module.ts prisma.service.ts apps/api/src/
git mv auth.common.ts apps/api/src/common/
git mv auth.controller.ts auth.service.ts auth.module.ts jwt.strategy.ts apps/api/src/auth/
git mv pools.controller.ts pools.service.ts pools.module.ts apps/api/src/pools/
git mv sessions.controller.ts sessions.service.ts sessions.module.ts apps/api/src/sessions/
git mv stats.controller.ts stats.service.ts stats.module.ts apps/api/src/stats/
git mv places.controller.ts places.service.ts places.module.ts apps/api/src/places/
git mv schema.prisma apps/api/prisma/
git mv docker-compose.yml .env.example apps/api/
```

> 归位后，现有相对 import（如 `'../common/auth.common'`、`'../prisma.service'`）即指向正确文件，编译错误消失。

- [ ] **Step 2: 写根 `package.json`（workspaces）**

```json
{
  "name": "swimmingtrace",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "npm run start:dev -w @swim/api",
    "build": "npm run build -w @swim/shared && npm run build -w @swim/api",
    "test": "npm run test -w @swim/api"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 3: 写 `.gitignore`**

```gitignore
node_modules/
dist/
.env
.cursorindexingignore
.specstory/
```

- [ ] **Step 4: 写 `apps/api/package.json`**（搬入原依赖 + 测试工具）

```json
{
  "name": "@swim/api",
  "version": "0.1.0",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "prisma": { "schema": "prisma/schema.prisma" },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@prisma/client": "^5.12.0",
    "@swim/shared": "*",
    "bcrypt": "^5.1.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/bcrypt": "^5.0.2",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.12.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "moduleNameMapper": { "^@swim/shared$": "<rootDir>/../../../packages/shared/src/index.ts" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 5: 写 `apps/api/nest-cli.json`、`tsconfig.json`、`tsconfig.build.json`**

`apps/api/nest-cli.json`:
```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "outDir": "./dist",
    "baseUrl": "./",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@swim/shared": ["../../packages/shared/src/index.ts"] }
  }
}
```

`apps/api/tsconfig.build.json`:
```json
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"] }
```

- [ ] **Step 6: 安装并验证编译**

```bash
npm install
npm run prisma:generate -w @swim/api
npm run build -w @swim/api
```
Expected: `nest build` 成功，生成 `apps/api/dist/`，无 TS 报错。
（`@swim/shared` 此时尚不存在，但 `paths`/`moduleNameMapper` 指向其源码——Task 2 会建。若 build 因 `@swim/shared` 缺失报错，先做 Task 2 的 Step 1-2 再回来。）

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: 后端归位到 apps/api，建立 workspaces monorepo"
```

---

### Task 2: `packages/shared` 共享类型

**Files:**
- Create: `packages/shared/package.json`、`packages/shared/tsconfig.json`、`packages/shared/src/index.ts`
- Test: 以 `tsc --noEmit` 通过为验收

**Interfaces:**
- Produces（后续 Task 全部依赖这些类型名）：`Role`、`RegistrationStatus`、`LoginResponse`、`MeResponse`、`CreatePoolDto`、`UpdatePoolDto`、`PoolSummary`、`PoolDetail`、`CreateSwimmerDto`、`SwimmerListItem`、`UpdateMembershipDto`、`CreateSessionDto`、`HeatmapCell`、`OverviewStats`、`PoolStats`、`SwimmerStats`。

- [ ] **Step 1: 写 `packages/shared/package.json`**

```json
{
  "name": "@swim/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc --noEmit -p tsconfig.json" },
  "devDependencies": { "typescript": "^5.4.0" }
}
```

- [ ] **Step 2: 写 `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021", "module": "commonjs", "declaration": true,
    "outDir": "dist", "strict": true, "esModuleInterop": true, "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 `packages/shared/src/index.ts`**（spec §6.2 全量类型）

```ts
export type Role = 'ADMIN' | 'OWNER' | 'SWIMMER';
export type RegistrationStatus = 'ACTIVE' | 'INACTIVE';

// auth
export interface LoginResponse { accessToken: string; }
export interface MeResponse { id: string; email: string; role: Role; }

// pools
export interface CreatePoolDto { name: string; address?: string; latitude?: number; longitude?: number; }
export interface UpdatePoolDto { name?: string; address?: string; latitude?: number; longitude?: number; }
export interface PoolSummary {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  memberCount: number; mileageLast30dMeters: number;
  archivedAt: string | null; createdAt: string;
}
export interface PoolDetail {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  archivedAt: string | null; memberCount: number; createdAt: string;
}

// swimmers / membership
export interface CreateSwimmerDto { name?: string; email: string; }
export interface SwimmerListItem {
  swimmerId: string; name: string | null; email: string;
  status: RegistrationStatus; claimedAt: string | null;
  mileageLast30dMeters: number; joinedAt: string;
}
export interface UpdateMembershipDto { status: RegistrationStatus; }

// 代录
export interface CreateSessionDto { distanceMeters: number; durationSeconds?: number; swamAt: string; }

// stats
export interface HeatmapCell { date: string; distanceMeters: number; }
export interface OverviewStats {
  poolCount: number; memberCount: number; activeMemberCount: number;
  mileageThisMonthMeters: number; sessionsThisMonth: number;
}
export interface PoolStats {
  memberCount: number; activeMemberCount: number; mileageThisMonthMeters: number;
  trend: HeatmapCell[]; heatmap: HeatmapCell[];
}
export interface SwimmerStats {
  summary: { totalDistanceMeters: number; totalDurationSeconds: number; sessionCount: number };
  heatmap: HeatmapCell[];
}
```

- [ ] **Step 4: 校验类型与后端编译**

```bash
npm run typecheck -w @swim/shared
npm run build -w @swim/api
```
Expected: 均通过。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 落地前后端共享 HTTP 类型"
```

---

### Task 3: 数据模型改动（archivedAt / claimedAt）

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: 以 `prisma generate` 成功 + 字段出现在 client 类型为验收

**Interfaces:**
- Produces: `Pool.archivedAt: DateTime?`、`User.claimedAt: DateTime?`，供后续 service 使用。

- [ ] **Step 1: 改 `schema.prisma`**

在 `model User` 内（`updatedAt` 之后）加：
```prisma
  claimedAt     DateTime?
```
在 `model Pool` 内（`updatedAt` 之后）加：
```prisma
  archivedAt    DateTime?
```

- [ ] **Step 2: 重新生成 client**

```bash
npm run prisma:generate -w @swim/api
```
Expected: 成功；`apps/api/node_modules/.prisma/client` 类型含 `archivedAt`、`claimedAt`。

- [ ] **Step 3: 建迁移（需运行中的 Postgres）**

```bash
# 若本地无库：cd apps/api && docker compose up -d  （或用 brew 起 postgis）
npm run prisma:migrate -w @swim/api -- --name add_pool_archived_user_claimed
```
Expected: 生成 `apps/api/prisma/migrations/*_add_pool_archived_user_claimed/`。
> 无库时可跳过本步，仅 `prisma generate` 即可让代码编译与单测通过；迁移在起库后补跑。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): Pool.archivedAt 与 User.claimedAt"
```

---

### Task 4: 所有权工具 `assertOwnsPool` / `assertOwnsSwimmer`（TDD）

**Files:**
- Create: `apps/api/src/common/ownership.ts`
- Test: `apps/api/src/common/ownership.spec.ts`

**Interfaces:**
- Produces:
  - `assertOwnsPool(prisma: PrismaService, ownerId: string, poolId: string)` — 返回**完整 Pool 记录**（无显式返回类型注解，由 `prisma.pool.findUnique` 推断，含 `name/address/latitude/longitude/createdAt/archivedAt`，供 `getPool` 复用）；不存在抛 `NotFoundException`，非本人抛 `ForbiddenException`。
  - `assertOwnsSwimmer(prisma: PrismaService, ownerId: string, swimmerId: string): Promise<void>` — 该游泳者须在 owner 名下任一泳池有 Registration，否则抛 `ForbiddenException`。

- [ ] **Step 1: 写失败测试** `apps/api/src/common/ownership.spec.ts`

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertOwnsPool, assertOwnsSwimmer } from './ownership';

const mkPrisma = (overrides: any = {}) => ({
  pool: { findUnique: jest.fn(), ...overrides.pool },
  registration: { findFirst: jest.fn(), ...overrides.registration },
}) as any;

describe('assertOwnsPool', () => {
  it('pool 不存在 → NotFoundException', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('非本人 → ForbiddenException', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回 pool', async () => {
    const pool = { id: 'p1', ownerId: 'o1', archivedAt: null };
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue(pool) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).resolves.toEqual(pool);
  });
});

describe('assertOwnsSwimmer', () => {
  it('无关联 → ForbiddenException', async () => {
    const prisma = mkPrisma({ registration: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(assertOwnsSwimmer(prisma, 'o1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('有关联 → 通过', async () => {
    const prisma = mkPrisma({ registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) } });
    await expect(assertOwnsSwimmer(prisma, 'o1', 's1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- ownership`
Expected: FAIL（`Cannot find module './ownership'`）。

- [ ] **Step 3: 写实现** `apps/api/src/common/ownership.ts`

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export async function assertOwnsPool(prisma: PrismaService, ownerId: string, poolId: string) {
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new NotFoundException('Pool not found');
  if (pool.ownerId !== ownerId) throw new ForbiddenException();
  return pool;
}

export async function assertOwnsSwimmer(prisma: PrismaService, ownerId: string, swimmerId: string): Promise<void> {
  const reg = await prisma.registration.findFirst({
    where: { swimmerId, pool: { ownerId } },
  });
  if (!reg) throw new ForbiddenException();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w @swim/api -- ownership`
Expected: PASS（5 个用例）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): 所有权工具 assertOwnsPool/assertOwnsSwimmer"
```

---

### Task 5: `GET /pools` 列出我的泳池（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`apps/api/src/pools/pools.controller.ts`
- Test: `apps/api/src/pools/pools.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`。
- Produces: `PoolsService.listMyPools(ownerId: string, includeArchived?: boolean): Promise<PoolSummary[]>`；`GET /pools?includeArchived=`。

- [ ] **Step 1: 写失败测试**（新建 `pools.service.spec.ts`）

```ts
import { PoolsService } from './pools.service';

const mkPrisma = (o: any = {}) => ({
  pool: { findMany: jest.fn().mockResolvedValue([]), ...o.pool },
  registration: { count: jest.fn().mockResolvedValue(0), ...o.registration },
  swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: null } }), ...o.swimSession },
}) as any;

describe('PoolsService.listMyPools', () => {
  it('默认只取未归档，并带 memberCount 与近 30 天里程', async () => {
    const prisma = mkPrisma({
      pool: { findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'A', address: null, latitude: null, longitude: null, archivedAt: null, createdAt: new Date('2026-01-01') },
      ]) },
      registration: { count: jest.fn().mockResolvedValue(3) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 1200 } }) },
    });
    const svc = new PoolsService(prisma);
    const res = await svc.listMyPools('o1');
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1', archivedAt: null } }));
    expect(res[0]).toMatchObject({ id: 'p1', memberCount: 3, mileageLast30dMeters: 1200 });
  });

  it('includeArchived 时不过滤 archivedAt', async () => {
    const prisma = mkPrisma();
    const svc = new PoolsService(prisma);
    await svc.listMyPools('o1', true);
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1' } }));
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL（`listMyPools is not a function`）。

- [ ] **Step 3: 写实现** — 在 `pools.service.ts` 顶部补 import 与类内方法

import 区补：
```ts
import { PoolSummary } from '@swim/shared';
```
类内新增：
```ts
  async listMyPools(ownerId: string, includeArchived = false): Promise<PoolSummary[]> {
    const pools = await this.prisma.pool.findMany({
      where: { ownerId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'desc' },
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return Promise.all(
      pools.map(async (p) => {
        const memberCount = await this.prisma.registration.count({ where: { poolId: p.id, status: 'ACTIVE' } });
        const agg = await this.prisma.swimSession.aggregate({
          where: { poolId: p.id, swamAt: { gte: since } },
          _sum: { distanceMeters: true },
        });
        return {
          id: p.id, name: p.name, address: p.address,
          latitude: p.latitude, longitude: p.longitude,
          memberCount, mileageLast30dMeters: agg._sum.distanceMeters ?? 0,
          archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
    );
  }
```

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`

import 补 `Query`：`import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';`
类内（`create` 之前）加：
```ts
  @Get()
  @Roles(Role.OWNER)
  list(@CurrentUser() user: AuthedUser, @Query('includeArchived') includeArchived?: string) {
    return this.pools.listMyPools(user.id, includeArchived === 'true');
  }
```

- [ ] **Step 5: 运行确认通过 + 编译**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + build 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /pools 列出我的泳池"
```

---

### Task 6: `GET /pools/:id` 泳池详情（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `apps/api/src/pools/pools.service.spec.ts`（追加）

**Interfaces:**
- Consumes: `assertOwnsPool`。
- Produces: `PoolsService.getPool(ownerId, poolId): Promise<PoolDetail>`；`GET /pools/:id`。

- [ ] **Step 1: 追加失败测试**

```ts
import { ForbiddenException } from '@nestjs/common';
describe('PoolsService.getPool', () => {
  it('非本人 → 403', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } });
    const svc = new PoolsService(prisma);
    await expect(svc.getPool('o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回详情含 memberCount', async () => {
    const prisma = mkPrisma({
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'A', address: null, latitude: null, longitude: null, archivedAt: null, ownerId: 'o1', createdAt: new Date('2026-01-01') }) },
      registration: { count: jest.fn().mockResolvedValue(2) },
    });
    const svc = new PoolsService(prisma);
    await expect(svc.getPool('o1', 'p1')).resolves.toMatchObject({ id: 'p1', memberCount: 2 });
  });
});
```
（`mkPrisma` 需含 `pool.findUnique`；在文件顶部的 `mkPrisma` 的 `pool` 默认补 `findUnique: jest.fn()`。）

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL（`getPool is not a function`）。

- [ ] **Step 3: 写实现** — `pools.service.ts`

import 补：`import { assertOwnsPool } from '../common/ownership';` 与 `PoolDetail`（合并到 `@swim/shared` import）。
类内新增：
```ts
  async getPool(ownerId: string, poolId: string): Promise<PoolDetail> {
    const pool = await assertOwnsPool(this.prisma, ownerId, poolId);
    const memberCount = await this.prisma.registration.count({ where: { poolId, status: 'ACTIVE' } });
    return {
      id: pool.id, name: pool.name, address: pool.address,
      latitude: pool.latitude, longitude: pool.longitude,
      archivedAt: pool.archivedAt ? pool.archivedAt.toISOString() : null,
      memberCount, createdAt: pool.createdAt.toISOString(),
    };
  }
```
> `assertOwnsPool` 返回的 pool 已含 `name/address/...`（来自 `findUnique`），类型足够。

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`，类内加：

```ts
  @Get(':id')
  @Roles(Role.OWNER)
  detail(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.pools.getPool(user.id, id);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /pools/:id 泳池详情"
```

---

### Task 7: `PATCH /pools/:id` 编辑 + `POST /pools/:id/archive` 归档（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `pools.service.spec.ts`（追加）

**Interfaces:**
- Produces: `updatePool(ownerId, poolId, dto: UpdatePoolDto)`、`archivePool(ownerId, poolId)`；`PATCH /pools/:id`、`POST /pools/:id/archive`。
- 后端 DTO 类 `UpdatePoolDto`（class-validator）定义于 `pools.service.ts`。

- [ ] **Step 1: 追加失败测试**

```ts
describe('PoolsService.updatePool / archivePool', () => {
  it('updatePool 校验所有权后更新', async () => {
    const prisma = mkPrisma({
      pool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'p1', name: 'B' }),
      },
    });
    const svc = new PoolsService(prisma);
    await svc.updatePool('o1', 'p1', { name: 'B' });
    expect(prisma.pool.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { name: 'B' } });
  });
  it('archivePool 设置 archivedAt', async () => {
    const prisma = mkPrisma({
      pool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'p1', archivedAt: new Date() }),
      },
    });
    const svc = new PoolsService(prisma);
    await svc.archivePool('o1', 'p1');
    expect(prisma.pool.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
    expect(prisma.pool.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `pools.service.ts`

DTO（放在 `CreatePoolDto` 之后）：
```ts
export class UpdatePoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}
```
类内方法：
```ts
  async updatePool(ownerId: string, poolId: string, dto: UpdatePoolDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    return this.prisma.pool.update({ where: { id: poolId }, data: { ...dto } });
  }

  async archivePool(ownerId: string, poolId: string) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    return this.prisma.pool.update({ where: { id: poolId }, data: { archivedAt: new Date() } });
  }
```

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`

import 补 `Patch`：`import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';`
import 补 `UpdatePoolDto`（合并到 `./pools.service` import）。类内加：
```ts
  @Patch(':id')
  @Roles(Role.OWNER)
  update(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: UpdatePoolDto) {
    return this.pools.updatePool(user.id, id, dto);
  }

  @Post(':id/archive')
  @Roles(Role.OWNER)
  archive(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.pools.archivePool(user.id, id);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): 编辑与归档泳池"
```

---

### Task 8: `POST /pools/:id/swimmers` owner 建游泳者（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `pools.service.spec.ts`（追加）

**Interfaces:**
- Produces: `createSwimmer(ownerId, poolId, dto: CreateSwimmerDto): Promise<SwimmerListItem>`；`POST /pools/:id/swimmers`。
- 后端 DTO 类 `CreateSwimmerDto`（class-validator）。

- [ ] **Step 1: 追加失败测试**

```ts
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('HASH') }));

describe('PoolsService.createSwimmer', () => {
  const base = () => ({
    pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
    user: { findUnique: jest.fn(), create: jest.fn() },
    registration: { upsert: jest.fn().mockResolvedValue({ status: 'ACTIVE', joinedAt: new Date('2026-02-01') }) },
  });

  it('新邮箱 → 建 SWIMMER + 随机密码 + 登记', async () => {
    const prisma: any = base();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 's1', name: 'Sam', email: 'a@b.c', claimedAt: null });
    const svc = new PoolsService(prisma);
    const res = await svc.createSwimmer('o1', 'p1', { name: 'Sam', email: 'a@b.c' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.c', role: 'SWIMMER', passwordHash: 'HASH' }) }));
    expect(prisma.registration.upsert).toHaveBeenCalled();
    expect(res).toMatchObject({ swimmerId: 's1', email: 'a@b.c', status: 'ACTIVE' });
  });

  it('邮箱已存在 → 复用用户，不再 create', async () => {
    const prisma: any = base();
    prisma.user.findUnique.mockResolvedValue({ id: 's9', name: 'Old', email: 'a@b.c', claimedAt: null });
    const svc = new PoolsService(prisma);
    const res = await svc.createSwimmer('o1', 'p1', { email: 'a@b.c' });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.swimmerId).toBe('s9');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `pools.service.ts`

文件顶部 import：
```ts
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { IsEmail } from 'class-validator';
```
（仅把 `SwimmerListItem` 合并进现有 `@swim/shared` import 行；**`CreateSwimmerDto` 用下方本地 class，不从 shared 引入以免与同名 interface 重名**。）
DTO：
```ts
export class CreateSwimmerDto {
  @IsOptional() @IsString() name?: string;
  @IsEmail() email: string;
}
```
类内方法：
```ts
  async createSwimmer(ownerId: string, poolId: string, dto: CreateSwimmerDto): Promise<SwimmerListItem> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash, role: 'SWIMMER' },
      });
    }
    const reg = await this.prisma.registration.upsert({
      where: { swimmerId_poolId: { swimmerId: user.id, poolId } },
      create: { swimmerId: user.id, poolId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return {
      swimmerId: user.id, name: user.name, email: user.email,
      status: reg.status, claimedAt: user.claimedAt ? user.claimedAt.toISOString() : null,
      mileageLast30dMeters: 0, joinedAt: reg.joinedAt.toISOString(),
    };
  }
```

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`

import 补 `CreateSwimmerDto`（合并进 `./pools.service` import）。类内加：
```ts
  @Post(':id/swimmers')
  @Roles(Role.OWNER)
  createSwimmer(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: CreateSwimmerDto) {
    return this.pools.createSwimmer(user.id, id, dto);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): owner 创建游泳者（邮箱已存在则复用）"
```

---

### Task 9: `GET /pools/:id/swimmers` 返回 SwimmerListItem[]（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `pools.service.spec.ts`（追加）

**Interfaces:**
- Consumes: `assertOwnsPool`（Task 6 已 import）、`SwimmerListItem`（Task 8 已 import）。
- Produces: `PoolsService.listSwimmers(ownerId, poolId): Promise<SwimmerListItem[]>` — **改签名**（原 `(poolId, ownerId)` → `(ownerId, poolId)`），返回**全部状态**会员（含 INACTIVE，供名册显示/恢复）+ 近 30 天里程；沿用路由 `GET /pools/:id/swimmers`。

- [ ] **Step 1: 追加失败测试**

```ts
describe('PoolsService.listSwimmers', () => {
  it('返回 SwimmerListItem[] 含状态与近 30 天里程', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findMany: jest.fn().mockResolvedValue([
        { swimmerId: 's1', status: 'ACTIVE', joinedAt: new Date('2026-02-01'),
          swimmer: { id: 's1', name: 'Sam', email: 'a@b.c', claimedAt: null } },
      ]) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 700 } }) },
    };
    const svc = new PoolsService(prisma);
    const res = await svc.listSwimmers('o1', 'p1');
    expect(res[0]).toMatchObject({ swimmerId: 's1', email: 'a@b.c', status: 'ACTIVE', mileageLast30dMeters: 700 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL（旧签名把 `'o1'` 当 poolId、`'p1'` 当 ownerId，所有权校验抛 403）。

- [ ] **Step 3: 写实现** — `pools.service.ts`，**替换**现有 `listSwimmers` 方法为：

```ts
  async listSwimmers(ownerId: string, poolId: string): Promise<SwimmerListItem[]> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const regs = await this.prisma.registration.findMany({
      where: { poolId },
      include: { swimmer: { select: { id: true, name: true, email: true, claimedAt: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return Promise.all(
      regs.map(async (r) => {
        const agg = await this.prisma.swimSession.aggregate({
          where: { swimmerId: r.swimmerId, poolId, swamAt: { gte: since } },
          _sum: { distanceMeters: true },
        });
        return {
          swimmerId: r.swimmer.id, name: r.swimmer.name, email: r.swimmer.email,
          status: r.status, claimedAt: r.swimmer.claimedAt ? r.swimmer.claimedAt.toISOString() : null,
          mileageLast30dMeters: agg._sum.distanceMeters ?? 0, joinedAt: r.joinedAt.toISOString(),
        };
      }),
    );
  }
```
> 旧实现里的 `NotFoundException`/`ForbiddenException` 仍被 `registerSwimmer` 使用，import 保留。

- [ ] **Step 4: 更新 controller 调用** — `pools.controller.ts` 的 `swimmers` 方法改为按新签名调用：

```ts
  @Get(':id/swimmers')
  @Roles(Role.OWNER)
  swimmers(@Param('id') poolId: string, @CurrentUser() user: AuthedUser) {
    return this.pools.listSwimmers(user.id, poolId);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /pools/:id/swimmers 返回 SwimmerListItem[]"
```

---

### Task 10: `PATCH /pools/:id/swimmers/:sid` 停用/恢复会员（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `pools.service.spec.ts`（追加）

**Interfaces:**
- Produces: `setMembershipStatus(ownerId, poolId, swimmerId, dto: UpdateMembershipDto)`；`PATCH /pools/:id/swimmers/:sid`。
- 后端 DTO 类 `UpdateMembershipDto`。

- [ ] **Step 1: 追加失败测试**

```ts
describe('PoolsService.setMembershipStatus', () => {
  it('校验所有权后更新 Registration 状态', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { update: jest.fn().mockResolvedValue({ status: 'INACTIVE' }) },
    };
    const svc = new PoolsService(prisma);
    await svc.setMembershipStatus('o1', 'p1', 's1', { status: 'INACTIVE' });
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { swimmerId_poolId: { swimmerId: 's1', poolId: 'p1' } },
      data: { status: 'INACTIVE' },
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `pools.service.ts`

import 补 `IsEnum`（class-validator）。**`UpdateMembershipDto` 用下方本地 class，不从 shared 引入以免与同名 interface 重名。**
DTO：
```ts
export class UpdateMembershipDto {
  @IsEnum({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' }) status: 'ACTIVE' | 'INACTIVE';
}
```
类内方法：
```ts
  async setMembershipStatus(ownerId: string, poolId: string, swimmerId: string, dto: UpdateMembershipDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    return this.prisma.registration.update({
      where: { swimmerId_poolId: { swimmerId, poolId } },
      data: { status: dto.status },
    });
  }
```

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`

import 补 `UpdateMembershipDto`（合并进 `./pools.service` import）。类内加：

```ts
  @Patch(':id/swimmers/:sid')
  @Roles(Role.OWNER)
  setMembership(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string, @Body() dto: UpdateMembershipDto) {
    return this.pools.setMembershipStatus(user.id, id, sid, dto);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): 停用/恢复会员"
```

---

### Task 11: `POST /pools/:id/swimmers/:sid/sessions` 代录（TDD）

**Files:**
- Modify: `apps/api/src/pools/pools.service.ts`、`pools.controller.ts`
- Test: `pools.service.spec.ts`（追加）

**Interfaces:**
- Consumes: `assertOwnsPool`、`assertOwnsSwimmer`。
- Produces: `recordSessionForSwimmer(ownerId, poolId, swimmerId, dto: CreateSessionDto)`；`POST /pools/:id/swimmers/:sid/sessions`。
- 后端 DTO 类 `RecordSessionDto`（实现 `CreateSessionDto`）。
- 决策：代录逻辑放 `PoolsService`（pool 作用域、已具备所有权工具），`SessionsService.create` 保留给 Phase 2 游泳者自录。

- [ ] **Step 1: 追加失败测试**

```ts
describe('PoolsService.recordSessionForSwimmer', () => {
  it('校验泳池与游泳者归属后创建 session', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) },
    };
    const svc = new PoolsService(prisma);
    await svc.recordSessionForSwimmer('o1', 'p1', 's1', { distanceMeters: 1000, swamAt: '2026-02-01T08:00:00.000Z' });
    expect(prisma.swimSession.create).toHaveBeenCalledWith({
      data: { swimmerId: 's1', poolId: 'p1', distanceMeters: 1000, durationSeconds: undefined, swamAt: new Date('2026-02-01T08:00:00.000Z') },
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- pools.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `pools.service.ts`

import 补 `assertOwnsSwimmer`（合并进 ownership import）、`IsDateString, IsInt, Min`（class-validator）、`CreateSessionDto`（`@swim/shared`）。
DTO：
```ts
export class RecordSessionDto implements CreateSessionDto {
  @IsInt() @Min(1) distanceMeters: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsDateString() swamAt: string;
}
```
类内方法：
```ts
  async recordSessionForSwimmer(ownerId: string, poolId: string, swimmerId: string, dto: CreateSessionDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    return this.prisma.swimSession.create({
      data: {
        swimmerId, poolId,
        distanceMeters: dto.distanceMeters,
        durationSeconds: dto.durationSeconds,
        swamAt: new Date(dto.swamAt),
      },
    });
  }
```

- [ ] **Step 4: 加 controller 路由** — `pools.controller.ts`

import 补 `RecordSessionDto`（合并进 `./pools.service` import）。类内加：
```ts
  @Post(':id/swimmers/:sid/sessions')
  @Roles(Role.OWNER)
  record(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string, @Body() dto: RecordSessionDto) {
    return this.pools.recordSessionForSwimmer(user.id, id, sid, dto);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- pools.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): owner 代录游泳记录"
```

---

### Task 12: `GET /stats/overview` 跨泳池汇总（TDD）

**Files:**
- Modify: `apps/api/src/stats/stats.service.ts`、`stats.controller.ts`
- Test: `apps/api/src/stats/stats.service.spec.ts`

**Interfaces:**
- Produces: `StatsService.overview(ownerId): Promise<OverviewStats>`；`GET /stats/overview`。

- [ ] **Step 1: 写失败测试**（新建 `stats.service.spec.ts`）

```ts
import { StatsService } from './stats.service';

describe('StatsService.overview', () => {
  it('无泳池 → 全 0', async () => {
    const prisma: any = { pool: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new StatsService(prisma);
    await expect(svc.overview('o1')).resolves.toEqual({
      poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0,
    });
  });
  it('有泳池 → 汇总会员与本月里程', async () => {
    const prisma: any = {
      pool: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
      registration: { count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(4) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 8000 }, _count: 12 }) },
    };
    const svc = new StatsService(prisma);
    await expect(svc.overview('o1')).resolves.toEqual({
      poolCount: 2, memberCount: 5, activeMemberCount: 4, mileageThisMonthMeters: 8000, sessionsThisMonth: 12,
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- stats.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `stats.service.ts`

import 补：`import { OverviewStats } from '@swim/shared';`
类内方法：
```ts
  async overview(ownerId: string): Promise<OverviewStats> {
    const pools = await this.prisma.pool.findMany({ where: { ownerId, archivedAt: null }, select: { id: true } });
    const poolIds = pools.map((p) => p.id);
    if (poolIds.length === 0) {
      return { poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0 };
    }
    const memberCount = await this.prisma.registration.count({ where: { poolId: { in: poolIds } } });
    const activeMemberCount = await this.prisma.registration.count({ where: { poolId: { in: poolIds }, status: 'ACTIVE' } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.swimSession.aggregate({
      where: { poolId: { in: poolIds }, swamAt: { gte: monthStart } },
      _sum: { distanceMeters: true }, _count: true,
    });
    return {
      poolCount: poolIds.length, memberCount, activeMemberCount,
      mileageThisMonthMeters: agg._sum.distanceMeters ?? 0, sessionsThisMonth: agg._count,
    };
  }
```

- [ ] **Step 4: 加 controller 路由** — `stats.controller.ts`

import 补 `Role` 与守卫装饰器：`import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';`、`import { Role } from '@prisma/client';`
类装饰器改为：`@UseGuards(JwtAuthGuard, RolesGuard)`（保留 `@Controller('stats')`）。类内加：
```ts
  @Get('overview')
  @Roles(Role.OWNER)
  overview(@CurrentUser() user: { id: string }) {
    return this.stats.overview(user.id);
  }
```
> 现有 `heatmap`/`summary` 方法上**额外**标注 `@Roles(Role.SWIMMER)`，避免类级 RolesGuard 影响它们（Phase 2 用）。

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- stats.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /stats/overview 跨泳池汇总"
```

---

### Task 13: `GET /stats/pool/:id` 单泳池聚合（TDD）

**Files:**
- Modify: `apps/api/src/stats/stats.service.ts`、`stats.controller.ts`
- Test: `stats.service.spec.ts`（追加）

**Interfaces:**
- Consumes: `assertOwnsPool`。
- Produces: `StatsService.poolStats(ownerId, poolId): Promise<PoolStats>`；私有 `dailyByPool(poolId, year): Promise<HeatmapCell[]>`；`GET /stats/pool/:id`。

- [ ] **Step 1: 追加失败测试**

```ts
import { ForbiddenException } from '@nestjs/common';
describe('StatsService.poolStats', () => {
  it('非本人 → 403', async () => {
    const prisma: any = { pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } };
    const svc = new StatsService(prisma);
    await expect(svc.poolStats('o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回 memberCount/里程/trend/heatmap', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 500 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ day: new Date('2026-02-01T00:00:00Z'), total: BigInt(500) }]),
    };
    const svc = new StatsService(prisma);
    const res = await svc.poolStats('o1', 'p1');
    expect(prisma.registration.count).toHaveBeenNthCalledWith(1, { where: { poolId: 'p1' } });
    expect(prisma.registration.count).toHaveBeenNthCalledWith(2, { where: { poolId: 'p1', status: 'ACTIVE' } });
    expect(res.memberCount).toBe(3);
    expect(res.activeMemberCount).toBe(2);
    expect(res.heatmap).toEqual([{ date: '2026-02-01', distanceMeters: 500 }]);
    expect(res.trend).toEqual(res.heatmap);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- stats.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `stats.service.ts`

import 补 `assertOwnsPool`、`PoolStats`、`HeatmapCell`、`Prisma`：
```ts
import { Prisma } from '@prisma/client';
import { assertOwnsPool } from '../common/ownership';
import { OverviewStats, PoolStats, HeatmapCell } from '@swim/shared';
```
类内方法：
```ts
  private async dailyByPool(poolId: string, year: number): Promise<HeatmapCell[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await this.prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "swamAt") AS day, SUM("distanceMeters") AS total
      FROM "SwimSession"
      WHERE "poolId" = ${poolId} AND "swamAt" >= ${start} AND "swamAt" < ${end}
      GROUP BY day ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), distanceMeters: Number(r.total) }));
  }

  async poolStats(ownerId: string, poolId: string): Promise<PoolStats> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const memberCount = await this.prisma.registration.count({ where: { poolId } });
    const activeMemberCount = await this.prisma.registration.count({ where: { poolId, status: 'ACTIVE' } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.swimSession.aggregate({
      where: { poolId, swamAt: { gte: monthStart } }, _sum: { distanceMeters: true },
    });
    const daily = await this.dailyByPool(poolId, now.getUTCFullYear());
    return {
      memberCount, activeMemberCount,
      mileageThisMonthMeters: agg._sum.distanceMeters ?? 0,
      trend: daily, heatmap: daily,
    };
  }
```
> `memberCount` 统计全部登记（含 INACTIVE），`activeMemberCount` 仅 ACTIVE —— 与 `overview` 口径一致。

- [ ] **Step 4: 加 controller 路由** — `stats.controller.ts`，类内加：

```ts
  @Get('pool/:id')
  @Roles(Role.OWNER)
  poolStats(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.stats.poolStats(user.id, id);
  }
```
import 补 `Param`：`import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';`

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- stats.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /stats/pool/:id 单泳池聚合"
```

---

### Task 14: `GET /stats/swimmer/:sid` 游泳者统计（TDD）

**Files:**
- Modify: `apps/api/src/stats/stats.service.ts`、`stats.controller.ts`
- Test: `stats.service.spec.ts`（追加）

**Interfaces:**
- Consumes: `assertOwnsSwimmer`。
- Produces: `StatsService.swimmerStats(ownerId, swimmerId): Promise<SwimmerStats>`；私有 `dailyBySwimmer(swimmerId, year)`；`GET /stats/swimmer/:sid`。

- [ ] **Step 1: 追加失败测试**

```ts
describe('StatsService.swimmerStats', () => {
  it('非本人名下游泳者 → 403', async () => {
    const prisma: any = { registration: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = new StatsService(prisma);
    await expect(svc.swimmerStats('o1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人名下 → 返回 summary + heatmap', async () => {
    const prisma: any = {
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 3000, durationSeconds: 1800 }, _count: 4 }) },
      $queryRaw: jest.fn().mockResolvedValue([{ day: new Date('2026-03-02T00:00:00Z'), total: BigInt(3000) }]),
    };
    const svc = new StatsService(prisma);
    const res = await svc.swimmerStats('o1', 's1');
    expect(res.summary).toEqual({ totalDistanceMeters: 3000, totalDurationSeconds: 1800, sessionCount: 4 });
    expect(res.heatmap).toEqual([{ date: '2026-03-02', distanceMeters: 3000 }]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/api -- stats.service`
Expected: FAIL。

- [ ] **Step 3: 写实现** — `stats.service.ts`

import 补 `assertOwnsSwimmer`（合并进 ownership import）、`SwimmerStats`（合并进 `@swim/shared` import）。
类内方法：
```ts
  private async dailyBySwimmer(swimmerId: string, year: number): Promise<HeatmapCell[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await this.prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "swamAt") AS day, SUM("distanceMeters") AS total
      FROM "SwimSession"
      WHERE "swimmerId" = ${swimmerId} AND "swamAt" >= ${start} AND "swamAt" < ${end}
      GROUP BY day ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), distanceMeters: Number(r.total) }));
  }

  async swimmerStats(ownerId: string, swimmerId: string): Promise<SwimmerStats> {
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    const agg = await this.prisma.swimSession.aggregate({
      where: { swimmerId }, _sum: { distanceMeters: true, durationSeconds: true }, _count: true,
    });
    const heatmap = await this.dailyBySwimmer(swimmerId, new Date().getUTCFullYear());
    return {
      summary: {
        totalDistanceMeters: agg._sum.distanceMeters ?? 0,
        totalDurationSeconds: agg._sum.durationSeconds ?? 0,
        sessionCount: agg._count,
      },
      heatmap,
    };
  }
```

- [ ] **Step 4: 加 controller 路由** — `stats.controller.ts`，类内加：

```ts
  @Get('swimmer/:sid')
  @Roles(Role.OWNER)
  swimmerStats(@CurrentUser() user: { id: string }, @Param('sid') sid: string) {
    return this.stats.swimmerStats(user.id, sid);
  }
```

- [ ] **Step 5: 运行确认通过 + build**

Run: `npm test -w @swim/api -- stats.service && npm run build -w @swim/api`
Expected: PASS + 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): GET /stats/swimmer/:sid 游泳者统计"
```

---

### Task 15: e2e 所有权冒烟（需运行中的 Postgres）

**Files:**
- Create: `apps/api/test/owner-flows.e2e-spec.ts`、`apps/api/test/jest-e2e.json`

**Interfaces:**
- Consumes: 完整 `AppModule`。
- 验收：owner A 无法访问 owner B 的泳池（403）；建会员 + 代录 happy path。

- [ ] **Step 1: 写 `apps/api/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^@swim/shared$": "<rootDir>/../../../packages/shared/src/index.ts" }
}
```

- [ ] **Step 2: 写 e2e 测试** `apps/api/test/owner-flows.e2e-spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Owner flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.swimSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => { await app.close(); });

  const reg = (email: string) =>
    request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });

  it('owner A 不能访问 owner B 的泳池 → 403', async () => {
    const a = (await reg('a@x.com')).body.accessToken;
    const b = (await reg('b@x.com')).body.accessToken;
    const poolB = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${b}`).send({ name: 'B-Pool' });
    await request(app.getHttpServer())
      .get(`/pools/${poolB.body.id}`).set('Authorization', `Bearer ${a}`)
      .expect(403);
  });

  it('建会员 + 代录 happy path', async () => {
    const a = (await reg('owner@x.com')).body.accessToken;
    const pool = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${a}`).send({ name: 'A-Pool' });
    const swimmer = await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${a}`)
      .send({ name: 'Sam', email: 'sam@x.com' }).expect(201);
    expect(swimmer.body.email).toBe('sam@x.com');
    await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers/${swimmer.body.swimmerId}/sessions`)
      .set('Authorization', `Bearer ${a}`)
      .send({ distanceMeters: 1000, swamAt: '2026-02-01T08:00:00.000Z' }).expect(201);
    const stats = await request(app.getHttpServer())
      .get(`/stats/swimmer/${swimmer.body.swimmerId}`).set('Authorization', `Bearer ${a}`).expect(200);
    expect(stats.body.summary.totalDistanceMeters).toBe(1000);
  });
});
```

- [ ] **Step 3: 起库 + 跑 e2e**

```bash
# 确保 .env 指向运行中的 Postgres 且已 prisma migrate
npm run test:e2e -w @swim/api
```
Expected: 2 个用例 PASS。
> 无库时本任务标记为待执行（实现完成、起库后补跑），不阻塞前端计划开始。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(api): owner 所有权与代录 e2e 冒烟"
```

---

## 完成后

后端 API 已可独立运行与演示（curl/Postman），单测全绿、e2e 冒烟覆盖关键所有权链路。
接续 **Plan 2（前端控制台）**：React + Vite + AntD 消费本 API（依赖 `@swim/shared` 类型）。
