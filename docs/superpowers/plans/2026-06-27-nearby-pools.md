# 附近泳池（Phase 2-D）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 superpowers:executing-plans。Steps 用 `- [ ]` 跟踪。

**Goal:** 游泳者端只读发现附近泳池——定位/手填 → 复用 PostGIS `/places/nearby` 列出附近泳池（名称/地址/距离）。

**Architecture:** 后端把 NearbyPlace 提到 @swim/shared + 补 places e2e；apps/swimmer 加 NearbyPoolsPage（geolocation + 手填回退 + List）、ProfilePage 入口、/nearby 路由、端点/hook。无新数据模型，复用已有端点。

**Tech Stack:** NestJS 10 · Prisma 5 · PostGIS · supertest · React 18 · antd-mobile · TanStack Query · Vitest/RTL/MSW。

## Global Constraints
- 设计见 `docs/superpowers/specs/2026-06-27-nearby-pools-design.md`。
- 只读发现；不做自助加入/地图/owner 侧/新模型。`/places/nearby` 维持 `JwtAuthGuard`。
- 频繁提交；后端跑 test:e2e + build；swimmer 跑 test/build。

---

### Task 1: shared `NearbyPlace` + places.service 改用
**Files:** Modify `packages/shared/src/index.ts`、`apps/api/src/places/places.service.ts`
- [ ] shared 追加：`export interface NearbyPlace { id: string; name: string; address: string | null; latitude: number; longitude: number; distanceMeters: number; }`
- [ ] `places.service.ts`：删本地 `interface NearbyPlace {...}`，改 `import { NearbyPlace } from '@swim/shared';`（`nearby()` 返回类型不变）。
- [ ] `npm run build -w @swim/shared && npm run build -w @swim/api` 通过。Commit `feat(shared): NearbyPlace 类型；places 复用之`。

### Task 2: places e2e（PostGIS 半径搜索）
**Files:** Create `apps/api/test/places-flows.e2e-spec.ts`（结构同其它 e2e，beforeAll 先删 challenge→session→registration→pool→user）。
- [ ] 测：
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Nearby places (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.challenge.deleteMany(); await prisma.swimSession.deleteMany();
    await prisma.registration.deleteMany(); await prisma.pool.deleteMany(); await prisma.user.deleteMany();
  });
  afterAll(async () => { await app.close(); });
  const srv = () => app.getHttpServer();

  it('附近返回带距离，远处不返回；缺 lat/lng → 400', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    // 北京坐标
    await request(srv()).post('/pools').set(oh).send({ name: '北京池', latitude: 39.9837, longitude: 116.3164 }).expect(201);

    // 同城近点（~中关村附近）→ 命中且 distanceMeters < 5000
    const near = await request(srv()).get('/places/nearby').query({ lat: 39.99, lng: 116.32, radiusMeters: 5000 }).set(oh).expect(200);
    const hit = near.body.find((p: any) => p.name === '北京池');
    expect(hit).toBeTruthy();
    expect(hit.distanceMeters).toBeLessThan(5000);

    // 远点（上海）半径 5km → 不命中
    const far = await request(srv()).get('/places/nearby').query({ lat: 31.2336, lng: 121.5055, radiusMeters: 5000 }).set(oh).expect(200);
    expect(far.body.find((p: any) => p.name === '北京池')).toBeFalsy();

    // 缺 lat/lng → 400
    await request(srv()).get('/places/nearby').query({ lat: 39.99 }).set(oh).expect(400);
  });
});
```
- [ ] `npm run test:e2e -w @swim/api` 全绿（4 个 e2e 文件）。Commit `test(api): /places/nearby PostGIS e2e`。

### Task 3: 游泳者端点/hook + 附近页 + 入口（TDD）
**Files:** Modify `apps/swimmer/src/lib/api/endpoints.ts`、`lib/queries.ts`、`features/profile/ProfilePage.tsx`、`app/router.tsx`、`test/msw.ts`；Create `features/nearby/NearbyPoolsPage.tsx`(+test)、`features/profile/ProfilePage` 入口（同文件改）。
- [ ] endpoints：`import type { NearbyPlace } from '@swim/shared';` + `export const getNearbyPlaces = (lat: number, lng: number, radiusMeters = 5000) => api.get<NearbyPlace[]>('/places/nearby', { params: { lat, lng, radiusMeters } }).then(r => r.data);`
- [ ] queries：`export const useNearbyPlaces = (coords: { lat: number; lng: number } | null, radiusMeters = 5000) => useQuery({ queryKey: ['nearby', coords?.lat, coords?.lng, radiusMeters], queryFn: () => getNearbyPlaces(coords!.lat, coords!.lng, radiusMeters), enabled: !!coords });`（import getNearbyPlaces from endpoints）。
- [ ] `test/msw.ts` 默认加 `http.get('/api/places/nearby', () => HttpResponse.json([]))`。
- [ ] **失败测试** `NearbyPoolsPage.test.tsx`：
```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { NearbyPoolsPage } from './NearbyPoolsPage';

const place = { id: 'p1', name: '北京池', address: '海淀区', latitude: 39.98, longitude: 116.31, distanceMeters: 1200 };

it('定位成功 → 列出附近泳池与距离', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: any) => ok({ coords: { latitude: 39.99, longitude: 116.32 } }) },
  });
  server.use(http.get('/api/places/nearby', () => HttpResponse.json([place])));
  renderWithProviders(<Routes><Route path="/nearby" element={<NearbyPoolsPage />} /></Routes>, { route: '/nearby' });
  expect(await screen.findByText('北京池')).toBeInTheDocument();
  expect(screen.getByText('1.2 km')).toBeInTheDocument();
});

it('定位失败 → 手填经纬度搜索', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (_ok: any, err: any) => err({ code: 1 }) },
  });
  server.use(http.get('/api/places/nearby', () => HttpResponse.json([place])));
  const user = (await import('@testing-library/user-event')).default;
  renderWithProviders(<Routes><Route path="/nearby" element={<NearbyPoolsPage />} /></Routes>, { route: '/nearby' });
  await user.type(await screen.findByPlaceholderText('纬度'), '39.99');
  await user.type(screen.getByPlaceholderText('经度'), '116.32');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  expect(await screen.findByText('北京池')).toBeInTheDocument();
});
```
- [ ] **实现** `NearbyPoolsPage.tsx`：`useState coords/manual`；`useEffect` 调 `navigator.geolocation.getCurrentPosition(ok→setCoords, ()→setManual(true))`（无 geolocation 也 setManual）。`useNearbyPlaces(coords)`。渲染：`coords` 未定且非 manual → `DotLoading`「定位中…」；`manual` → 纬度/经度 `Input` + `Button 搜索`（提交 setCoords）；查询 `isError` → `ErrorBlock`；`data` 空 → 文案「附近 5 公里内没有找到泳池」；否则 `List`（名称、`description=address`、`extra=formatDistance(distanceMeters)`）。`formatDistance(m)= m>=1000? (m/1000).toFixed(1)+' km' : Math.round(m)+' m'`。
- [ ] `ProfilePage`：`List` 加 `<List.Item clickable onClick={() => navigate('/nearby')}>附近泳池</List.Item>`（import useNavigate）。
- [ ] `router.tsx`：受保护 AppShell 内加 `<Route path="/nearby" element={<NearbyPoolsPage />} />`。
- [ ] 测试 + build；Commit `feat(swimmer): 附近泳池（定位/手填发现）`。

### Task 4: 终验 + 收尾
- [ ] 全量门禁 `npm run lint && npm run build && npm test && npm run test:e2e` 全绿。
- [ ] 实跑：`/places/nearby` 对种子泳池（北京/上海坐标）返回合理距离。
- [ ] 聚焦自评审（ultracode 关，不自动多智能体）；README 补「附近泳池」一句；通知验收。
