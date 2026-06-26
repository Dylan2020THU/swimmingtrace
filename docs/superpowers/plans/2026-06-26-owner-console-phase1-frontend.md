# OWNER 控制台 Phase 1 · 前端（React+Vite+AntD）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 monorepo 里新增 `apps/web`——一个 React + Vite + AntD 的响应式 SPA，作为 OWNER 管理控制台，消费已实现的后端 API（复用 `@swim/shared` 类型），覆盖登录、泳池总览、单泳池（信息/会员/看板）、游泳者详情（含代录）。

**Architecture:** Vite SPA。axios 实例（`baseURL='/api'`，dev 走 Vite proxy 到 `:3000`）+ 拦截器（注入 Bearer / 401 清登录态跳登录）。TanStack Query 管所有服务端状态；Zustand 仅管 auth（token+user，持久化 localStorage）。React Router v6 + `ProtectedRoute`（登录 + OWNER 角色）。所有请求/响应类型来自 `@swim/shared`。测试用 Vitest + React Testing Library + MSW（mock 后端），覆盖关键流。

**Tech Stack:** React 18、Vite 5、TypeScript 5、Ant Design 5、@tanstack/react-query 5、zustand 4、axios 1、react-router-dom 6、@uiw/react-heat-map、recharts；测试 Vitest 1 + @testing-library/react + @testing-library/user-event + @testing-library/jest-dom + msw 2 + jsdom。

## Global Constraints

- 新增 workspace `@swim/web`，位于 `apps/web`；不改动 `apps/api` 与 `packages/shared`（仅作为依赖消费）。
- 所有"过 HTTP 的类型"一律 `import ... from '@swim/shared'`；**不要**在前端重复定义这些 interface。
- axios 实例 `baseURL='/api'`；Vite dev proxy 把 `/api/*` 转发到 `http://localhost:3000` 并 **strip 掉 `/api` 前缀**（后端路由是 `/auth`、`/pools`…，无 `/api` 前缀）。
- 鉴权：token 存 Zustand `useAuthStore` 并持久化 `localStorage`（key `swim-auth`）；请求拦截器注入 `Authorization: Bearer <token>`；响应 `401` → 清 auth + 跳 `/login`。
- 路由守卫 `ProtectedRoute`：未登录跳 `/login`；已登录但 `role !== 'OWNER'` 显示无权限（不进入控制台）。
- 错误反馈：mutation/查询失败用 AntD `message.error(后端 message)`；表单用 AntD `Form` 校验镜像后端 DTO 约束。
- 库选型固定：表格/表单/布局用 AntD；热力图 `@uiw/react-heat-map`（吃 `HeatmapCell[]`）；趋势图 `recharts`。
- 测试：Vitest + RTL + MSW；必须覆盖 spec §9 的关键流（登录→重定向、新建泳池、建会员、代录弹窗、ProtectedRoute 角色拦截）。不引入 Playwright。
- 不实现非目标：赛事/挑战、游泳者自助端、附近泳池地图、CSV、批量操作、通知。
- 频繁提交：每个 Task 末尾提交一次。

---

## 后端契约速查（已实现，前端按此对接）

类型来自 `@swim/shared`。所有非 auth 接口需 `Authorization: Bearer`，且要求 `role=OWNER`。

| 方法 路径 | 请求体 | 响应 |
|---|---|---|
| POST `/auth/login` | `{ email, password }` | `LoginResponse {accessToken}` |
| POST `/auth/register` | `{ email, password, name?, role? }` | `LoginResponse` |
| GET `/auth/me` | — | `MeResponse {id,email,role}` |
| GET `/pools?includeArchived=` | — | `PoolSummary[]` |
| POST `/pools` | `CreatePoolDto` | 创建的 pool（含 `id`） |
| GET `/pools/:id` | — | `PoolDetail` |
| PATCH `/pools/:id` | `UpdatePoolDto` | 更新后的 pool |
| POST `/pools/:id/archive` | — | `{ id, archivedAt, ... }` |
| GET `/pools/:id/swimmers` | — | `SwimmerListItem[]` |
| POST `/pools/:id/swimmers` | `CreateSwimmerDto` | `SwimmerListItem` |
| PATCH `/pools/:id/swimmers/:sid` | `UpdateMembershipDto` | 更新后的 registration |
| POST `/pools/:id/swimmers/:sid/sessions` | `CreateSessionDto` | 创建的 session |
| GET `/stats/overview` | — | `OverviewStats` |
| GET `/stats/pool/:id` | — | `PoolStats` |
| GET `/stats/swimmer/:sid` | — | `SwimmerStats` |

---

## 文件结构总览

```
apps/web/
├─ package.json              # @swim/web：deps + scripts + 无独立 jest（用 vitest）
├─ index.html
├─ vite.config.ts            # react 插件 + dev proxy + vitest 配置
├─ tsconfig.json  tsconfig.node.json
├─ src/
│  ├─ main.tsx               # 挂载 App
│  ├─ setupTests.ts          # jest-dom + MSW server 生命周期
│  ├─ test/
│  │  ├─ render.tsx          # renderWithProviders 工具（QueryClient + Router + AntD）
│  │  └─ msw.ts              # MSW server + 默认 handlers
│  ├─ lib/
│  │  ├─ auth-store.ts       # Zustand useAuthStore（token/user + localStorage）
│  │  ├─ api/
│  │  │  ├─ client.ts        # axios 实例 + 拦截器
│  │  │  └─ endpoints.ts     # 强类型端点函数（用 @swim/shared）
│  │  └─ queries.ts          # TanStack Query hooks（queryKeys + use*）
│  ├─ components/
│  │  ├─ ProtectedRoute.tsx
│  │  ├─ AppLayout.tsx       # Sider + Header + PoolSwitcher + logout
│  │  └─ ErrorBoundary.tsx
│  ├─ features/
│  │  ├─ auth/LoginPage.tsx
│  │  ├─ pools/OverviewPage.tsx
│  │  ├─ pools/PoolDetailPage.tsx
│  │  ├─ pools/PoolForm.tsx          # 新建/编辑泳池表单（Modal 内）
│  │  ├─ swimmers/RosterTable.tsx
│  │  ├─ swimmers/CreateSwimmerModal.tsx
│  │  ├─ swimmers/SwimmerDetailPage.tsx
│  │  ├─ sessions/RecordSessionModal.tsx
│  │  └─ dashboard/{StatCards,HeatmapCard,TrendChart}.tsx
│  ├─ app/
│  │  ├─ providers.tsx       # QueryClientProvider + AntD App/ConfigProvider + auth bootstrap
│  │  └─ router.tsx          # 路由表
│  └─ App.tsx                # providers + router
```

---

### Task 1: 脚手架 `apps/web` + 测试工具链（Vitest/RTL/MSW）

**Files:**
- Create: `apps/web/package.json`、`apps/web/index.html`、`apps/web/vite.config.ts`、`apps/web/tsconfig.json`、`apps/web/tsconfig.node.json`、`apps/web/src/main.tsx`、`apps/web/src/App.tsx`、`apps/web/src/setupTests.ts`、`apps/web/src/test/msw.ts`、`apps/web/src/test/render.tsx`、`apps/web/src/smoke.test.tsx`
- Modify: none（根 `package.json` 的 workspaces 已含 `apps/*`）

**Interfaces:**
- Produces: 可构建的 `@swim/web`；`renderWithProviders(ui)`（test/render.tsx）；`server`（test/msw.ts）；`npm test -w @swim/web` 可运行 Vitest。

- [ ] **Step 1: 写 `apps/web/package.json`**

```json
{
  "name": "@swim/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ant-design/icons": "^5.3.0",
    "@swim/shared": "*",
    "@tanstack/react-query": "^5.28.0",
    "@uiw/react-heat-map": "^2.2.1",
    "antd": "^5.16.0",
    "axios": "^1.6.8",
    "dayjs": "^1.11.10",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "recharts": "^2.12.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^14.2.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^24.0.0",
    "msw": "^2.2.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: 写 `apps/web/vite.config.ts`**（含 dev proxy + vitest）

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: false,
  },
});
```

- [ ] **Step 3: 写 `tsconfig.json` 与 `tsconfig.node.json`**

`apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "paths": { "@swim/shared": ["../../packages/shared/src/index.ts"] },
    "baseUrl": "."
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```
`apps/web/tsconfig.node.json`:
```json
{
  "compilerOptions": { "composite": true, "skipLibCheck": true, "module": "ESNext", "moduleResolution": "bundler", "allowSyntheticDefaultImports": true },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: 写 `index.html` 与 `src/main.tsx` 与 `src/App.tsx`（占位）**

`apps/web/index.html`:
```html
<!doctype html>
<html lang="zh">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Swim 管理控制台</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```
`apps/web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```
`apps/web/src/App.tsx`（占位，Task 5 替换为 providers+router）:
```tsx
export default function App() {
  return <div>Swim 管理控制台</div>;
}
```

- [ ] **Step 5: 写 MSW server 与 setupTests**

`apps/web/src/test/msw.ts`:
```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// 默认 handlers：返回最小合法数据；具体测试用 server.use(...) 覆盖。
export const handlers = [
  http.post('/api/auth/login', () => HttpResponse.json({ accessToken: 'test-token' })),
  http.get('/api/auth/me', () => HttpResponse.json({ id: 'o1', email: 'owner@x.com', role: 'OWNER' })),
  http.get('/api/pools', () => HttpResponse.json([])),
  http.get('/api/stats/overview', () =>
    HttpResponse.json({ poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0 })),
];

export const server = setupServer(...handlers);
```
`apps/web/src/setupTests.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 6: 写 `renderWithProviders` 工具**

`apps/web/src/test/render.tsx`:
```tsx
import { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 7: 写 smoke test + 跑通**

`apps/web/src/smoke.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test/render';
import App from './App';

describe('smoke', () => {
  it('App 渲染标题', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Swim 管理控制台')).toBeInTheDocument();
  });
});
```

Run（首次需安装新依赖）:
```bash
npm install --cache /private/tmp/npm-cache-web
npm test -w @swim/web
npm run build -w @swim/web
```
Expected: smoke test PASS；`vite build` 成功。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): 脚手架 apps/web + Vitest/RTL/MSW 工具链"
```

---

### Task 2: 鉴权 store `useAuthStore`（Zustand + localStorage）（TDD）

**Files:**
- Create: `apps/web/src/lib/auth-store.ts`、`apps/web/src/lib/auth-store.test.ts`

**Interfaces:**
- Produces: `useAuthStore`（zustand store），state `{ token: string | null; user: MeResponse | null }`，actions `setAuth(token, user)`、`setUser(user)`、`clear()`；持久化到 `localStorage` key `swim-auth`（仅持久化 token）。`useAuthStore.getState()` 供非组件代码（拦截器）读取。

- [ ] **Step 1: 写失败测试** `apps/web/src/lib/auth-store.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => { useAuthStore.getState().clear(); localStorage.clear(); });

  it('setAuth 存 token+user 并写入 localStorage', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().user?.email).toBe('o@x.com');
    expect(localStorage.getItem('swim-auth')).toContain('tok');
  });

  it('clear 清空 token+user', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- auth-store`
Expected: FAIL（`Cannot find module './auth-store'`）。

- [ ] **Step 3: 写实现** `apps/web/src/lib/auth-store.ts`

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MeResponse } from '@swim/shared';

interface AuthState {
  token: string | null;
  user: MeResponse | null;
  setAuth: (token: string, user: MeResponse) => void;
  setUser: (user: MeResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'swim-auth',
      partialize: (s) => ({ token: s.token }), // 只持久化 token；user 启动时用 /auth/me 重新拉
    },
  ),
);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w @swim/web -- auth-store`
Expected: PASS（2 用例）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): useAuthStore 鉴权状态 + 持久化"
```

---

### Task 3: axios 客户端 + 拦截器（TDD）

**Files:**
- Create: `apps/web/src/lib/api/client.ts`、`apps/web/src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: `useAuthStore`。
- Produces: `api`（axios 实例，`baseURL='/api'`）；请求拦截器注入 `Authorization: Bearer <token>`（token 存在时）；响应拦截器：`401` → `useAuthStore.getState().clear()` + `redirectToLogin()`（默认 `window.location.assign('/login')`，导出以便测试替换）。导出 `setRedirectToLogin(fn)`。

- [ ] **Step 1: 写失败测试** `apps/web/src/lib/api/client.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { api, setRedirectToLogin } from './client';
import { useAuthStore } from '../auth-store';

describe('api client', () => {
  beforeEach(() => { useAuthStore.getState().clear(); });

  it('有 token 时注入 Authorization 头', async () => {
    useAuthStore.getState().setAuth('tok123', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    let seen: string | null = null;
    server.use(http.get('/api/ping', ({ request }) => {
      seen = request.headers.get('authorization');
      return HttpResponse.json({ ok: true });
    }));
    await api.get('/ping');
    expect(seen).toBe('Bearer tok123');
  });

  it('401 时清登录态并触发重定向', async () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    const redirect = vi.fn();
    setRedirectToLogin(redirect);
    server.use(http.get('/api/secure', () => new HttpResponse(null, { status: 401 })));
    await expect(api.get('/secure')).rejects.toBeTruthy();
    expect(useAuthStore.getState().token).toBeNull();
    expect(redirect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- client`
Expected: FAIL（`Cannot find module './client'`）。

- [ ] **Step 3: 写实现** `apps/web/src/lib/api/client.ts`

```ts
import axios from 'axios';
import { useAuthStore } from '../auth-store';

let redirectToLogin = () => { window.location.assign('/login'); };
export function setRedirectToLogin(fn: () => void) { redirectToLogin = fn; }

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().clear();
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w @swim/web -- client`
Expected: PASS（2 用例）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): axios 实例 + Bearer/401 拦截器"
```

---

### Task 4: 端点函数 + Query hooks（TDD）

**Files:**
- Create: `apps/web/src/lib/api/endpoints.ts`、`apps/web/src/lib/queries.ts`、`apps/web/src/lib/queries.test.tsx`

**Interfaces:**
- Consumes: `api`（client.ts）、`@swim/shared` 类型。
- Produces:
  - endpoints.ts 函数：`login(body)`、`register(body)`、`getMe()`、`listPools(includeArchived?)`、`getPool(id)`、`createPool(body)`、`updatePool(id, body)`、`archivePool(id)`、`listSwimmers(poolId)`、`createSwimmer(poolId, body)`、`setMembership(poolId, sid, body)`、`recordSession(poolId, sid, body)`、`getOverview()`、`getPoolStats(id)`、`getSwimmerStats(sid)`。
  - queries.ts：`queryKeys`（`pools`、`pool(id)`、`swimmers(poolId)`、`overview`、`poolStats(id)`、`swimmerStats(sid)`）；查询 hooks `usePools`、`usePool`、`useSwimmers`、`useOverview`、`usePoolStats`、`useSwimmerStats`；mutation hooks `useCreatePool`、`useUpdatePool`、`useArchivePool`、`useCreateSwimmer`、`useSetMembership`、`useRecordSession`（成功后 invalidate 相关 key）。

- [ ] **Step 1: 写失败测试** `apps/web/src/lib/queries.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw';
import { usePools } from './queries';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePools', () => {
  it('拉取泳池列表', async () => {
    server.use(http.get('/api/pools', () => HttpResponse.json([
      { id: 'p1', name: 'A', address: null, latitude: null, longitude: null, memberCount: 2, mileageLast30dMeters: 100, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ])));
    const { result } = renderHook(() => usePools(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe('A');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- queries`
Expected: FAIL（`Cannot find module './queries'`）。

- [ ] **Step 3: 写 `endpoints.ts`**

```ts
import { api } from './client';
import type {
  LoginResponse, MeResponse, CreatePoolDto, UpdatePoolDto, PoolSummary, PoolDetail,
  CreateSwimmerDto, SwimmerListItem, UpdateMembershipDto, CreateSessionDto,
  OverviewStats, PoolStats, SwimmerStats,
} from '@swim/shared';

export const login = (b: { email: string; password: string }) =>
  api.post<LoginResponse>('/auth/login', b).then((r) => r.data);
export const register = (b: { email: string; password: string; name?: string; role?: 'OWNER' }) =>
  api.post<LoginResponse>('/auth/register', b).then((r) => r.data);
export const getMe = () => api.get<MeResponse>('/auth/me').then((r) => r.data);

export const listPools = (includeArchived = false) =>
  api.get<PoolSummary[]>('/pools', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const getPool = (id: string) => api.get<PoolDetail>(`/pools/${id}`).then((r) => r.data);
export const createPool = (b: CreatePoolDto) => api.post(`/pools`, b).then((r) => r.data);
export const updatePool = (id: string, b: UpdatePoolDto) => api.patch(`/pools/${id}`, b).then((r) => r.data);
export const archivePool = (id: string) => api.post(`/pools/${id}/archive`).then((r) => r.data);

export const listSwimmers = (poolId: string) =>
  api.get<SwimmerListItem[]>(`/pools/${poolId}/swimmers`).then((r) => r.data);
export const createSwimmer = (poolId: string, b: CreateSwimmerDto) =>
  api.post<SwimmerListItem>(`/pools/${poolId}/swimmers`, b).then((r) => r.data);
export const setMembership = (poolId: string, sid: string, b: UpdateMembershipDto) =>
  api.patch(`/pools/${poolId}/swimmers/${sid}`, b).then((r) => r.data);
export const recordSession = (poolId: string, sid: string, b: CreateSessionDto) =>
  api.post(`/pools/${poolId}/swimmers/${sid}/sessions`, b).then((r) => r.data);

export const getOverview = () => api.get<OverviewStats>('/stats/overview').then((r) => r.data);
export const getPoolStats = (id: string) => api.get<PoolStats>(`/stats/pool/${id}`).then((r) => r.data);
export const getSwimmerStats = (sid: string) => api.get<SwimmerStats>(`/stats/swimmer/${sid}`).then((r) => r.data);
```

- [ ] **Step 4: 写 `queries.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePoolDto, UpdatePoolDto, CreateSwimmerDto, UpdateMembershipDto, CreateSessionDto } from '@swim/shared';
import * as ep from './api/endpoints';

export const queryKeys = {
  pools: ['pools'] as const,
  pool: (id: string) => ['pool', id] as const,
  swimmers: (poolId: string) => ['swimmers', poolId] as const,
  overview: ['overview'] as const,
  poolStats: (id: string) => ['poolStats', id] as const,
  swimmerStats: (sid: string) => ['swimmerStats', sid] as const,
};

export const usePools = (includeArchived = false) =>
  useQuery({ queryKey: [...queryKeys.pools, includeArchived], queryFn: () => ep.listPools(includeArchived) });
export const usePool = (id: string) => useQuery({ queryKey: queryKeys.pool(id), queryFn: () => ep.getPool(id) });
export const useSwimmers = (poolId: string) =>
  useQuery({ queryKey: queryKeys.swimmers(poolId), queryFn: () => ep.listSwimmers(poolId) });
export const useOverview = () => useQuery({ queryKey: queryKeys.overview, queryFn: ep.getOverview });
export const usePoolStats = (id: string) => useQuery({ queryKey: queryKeys.poolStats(id), queryFn: () => ep.getPoolStats(id) });
export const useSwimmerStats = (sid: string) =>
  useQuery({ queryKey: queryKeys.swimmerStats(sid), queryFn: () => ep.getSwimmerStats(sid) });

export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreatePoolDto) => ep.createPool(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pools }); qc.invalidateQueries({ queryKey: queryKeys.overview }); },
  });
}
export function useUpdatePool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdatePoolDto) => ep.updatePool(id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pool(id) }); qc.invalidateQueries({ queryKey: queryKeys.pools }); },
  });
}
export function useArchivePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ep.archivePool(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pools }); qc.invalidateQueries({ queryKey: queryKeys.overview }); },
  });
}
export function useCreateSwimmer(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSwimmerDto) => ep.createSwimmer(poolId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) }); qc.invalidateQueries({ queryKey: queryKeys.poolStats(poolId) }); },
  });
}
export function useSetMembership(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sid: string; body: UpdateMembershipDto }) => ep.setMembership(poolId, v.sid, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) }),
  });
}
export function useRecordSession(poolId: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSessionDto) => ep.recordSession(poolId, sid, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.swimmerStats(sid) });
      qc.invalidateQueries({ queryKey: queryKeys.poolStats(poolId) });
      qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) });
    },
  });
}
```

- [ ] **Step 5: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- queries && npm run build -w @swim/web`
Expected: PASS + 构建通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): 端点函数 + TanStack Query hooks"
```

---

### Task 5: Providers + 路由 + ProtectedRoute + 启动鉴权（TDD）

**Files:**
- Create: `apps/web/src/components/ProtectedRoute.tsx`、`apps/web/src/app/providers.tsx`、`apps/web/src/app/router.tsx`、`apps/web/src/components/ProtectedRoute.test.tsx`
- Modify: `apps/web/src/App.tsx`（替换占位为 `<Providers><Router/></Providers>`）

**Interfaces:**
- Consumes: `useAuthStore`、queries、AntD。
- Produces：`<ProtectedRoute>`（无 token→`<Navigate to="/login">`；有 token 但 `user?.role !== 'OWNER'`→渲染"无权限"AntD `Result`；否则渲染 children/`<Outlet/>`）；`<Providers>`（QueryClientProvider + AntD `ConfigProvider`+`App` + 启动时若有 token 则 `getMe()` 写入 `setUser`）；`<AppRouter>`（路由表，引用 Task 6-12 的页面，先用占位元素，后续 Task 替换为真实页面）。

- [ ] **Step 1: 写失败测试** `apps/web/src/components/ProtectedRoute.test.tsx`

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/render';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../lib/auth-store';

const Guarded = () => (
  <Routes>
    <Route path="/login" element={<div>登录页</div>} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<div>控制台首页</div>} />
    </Route>
  </Routes>
);

describe('ProtectedRoute', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('未登录 → 跳登录页', () => {
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText('登录页')).toBeInTheDocument();
  });

  it('登录但非 OWNER → 无权限', () => {
    useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText(/无权限|403/)).toBeInTheDocument();
  });

  it('OWNER → 进入控制台', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText('控制台首页')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- ProtectedRoute`
Expected: FAIL（`Cannot find module './ProtectedRoute'`）。

- [ ] **Step 3: 写 `ProtectedRoute.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Result } from 'antd';
import { useAuthStore } from '../lib/auth-store';

export function ProtectedRoute() {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'OWNER') {
    return <Result status="403" title="403" subTitle="无权限：此控制台仅限泳池主（OWNER）。" />;
  }
  return <Outlet />;
}
```

- [ ] **Step 4: 写 `providers.tsx`**

```tsx
import { ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useAuthStore } from '../lib/auth-store';
import { getMe } from '../lib/api/endpoints';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export function Providers({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current || !token) return;
    booted.current = true;
    getMe().then(setUser).catch(() => clear());
  }, [token, setUser, clear]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider><AntdApp>{children}</AntdApp></ConfigProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: 写 `router.tsx`（页面先用占位，后续 Task 替换 import）**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { AppLayout } from '../components/AppLayout';
import { OverviewPage } from '../features/pools/OverviewPage';
import { PoolDetailPage } from '../features/pools/PoolDetailPage';
import { SwimmerDetailPage } from '../features/swimmers/SwimmerDetailPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/pools" replace />} />
            <Route path="/pools" element={<OverviewPage />} />
            <Route path="/pools/:poolId" element={<PoolDetailPage />} />
            <Route path="/pools/:poolId/swimmers/:sid" element={<SwimmerDetailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/pools" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```
> 注：本 Task 需创建以下**最小占位导出**让 router 能编译；Task 6-12 用真实实现替换同名文件。逐个写出（不要省略）：
> - `apps/web/src/features/auth/LoginPage.tsx` → `export function LoginPage(){return <div>login</div>;}`
> - `apps/web/src/features/pools/OverviewPage.tsx` → `export function OverviewPage(){return <div>overview</div>;}`
> - `apps/web/src/features/pools/PoolDetailPage.tsx` → `export function PoolDetailPage(){return <div>pool-detail</div>;}`
> - `apps/web/src/features/swimmers/SwimmerDetailPage.tsx` → `export function SwimmerDetailPage(){return <div>swimmer-detail</div>;}`
> - `apps/web/src/components/AppLayout.tsx` → `import {Outlet} from 'react-router-dom'; export function AppLayout(){return <Outlet/>;}`（必须渲染 `<Outlet/>`，否则子路由不显示）

- [ ] **Step 6: 改 `App.tsx`**

```tsx
import { Providers } from './app/providers';
import { AppRouter } from './app/router';

export default function App() {
  return <Providers><AppRouter /></Providers>;
}
```
> **删除 `apps/web/src/smoke.test.tsx`**：它渲染占位 `<App/>` 并用 `renderWithProviders` 包裹；现在 `App` 自带 `Providers`(QueryClient) + `AppRouter`(BrowserRouter)，再用 `renderWithProviders` 包裹会造成 Provider/Router 双重嵌套。其"harness 可用"的职责已由 `ProtectedRoute.test.tsx` 及后续页面测试覆盖，直接删除即可（`git rm apps/web/src/smoke.test.tsx`）。

- [ ] **Step 7: 运行确认通过 + 构建**

Run: `npm test -w @swim/web && npm run build -w @swim/web`
Expected: ProtectedRoute 3 用例 PASS、smoke PASS；构建通过。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): Providers + 路由 + ProtectedRoute + 启动鉴权"
```

---

### Task 6: 登录 / 注册为 OWNER 页（TDD）

**Files:**
- Create: `apps/web/src/features/auth/LoginPage.test.tsx`
- Modify: `apps/web/src/features/auth/LoginPage.tsx`（替换占位）

**Interfaces:**
- Consumes: `login`/`register`（endpoints）、`getMe`、`useAuthStore`、AntD `Form`、`useNavigate`。
- Produces: `<LoginPage>` —— 登录表单（email+password）+ "注册为 OWNER" 切换；提交成功后 `setAuth(token, me)` 并 `navigate('/pools')`。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/auth/LoginPage.test.tsx`

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../../lib/auth-store';

beforeEach(() => useAuthStore.getState().clear());

it('登录成功 → 存 token 并跳转 /pools', async () => {
  server.use(
    http.post('/api/auth/login', () => HttpResponse.json({ accessToken: 'tok-login' })),
    http.get('/api/auth/me', () => HttpResponse.json({ id: 'o1', email: 'o@x.com', role: 'OWNER' })),
  );
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pools" element={<div>总览页</div>} />
    </Routes>,
    { route: '/login' },
  );
  await userEvent.type(screen.getByLabelText('邮箱'), 'o@x.com');
  await userEvent.type(screen.getByLabelText('密码'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: '登录' }));
  await waitFor(() => expect(screen.getByText('总览页')).toBeInTheDocument());
  expect(useAuthStore.getState().token).toBe('tok-login');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- LoginPage`
Expected: FAIL（占位 LoginPage 无表单，找不到"邮箱"label）。

- [ ] **Step 3: 写实现** `apps/web/src/features/auth/LoginPage.tsx`

```tsx
import { useState } from 'react';
import { Button, Card, Form, Input, Segmented, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { login, register, getMe } from '../../lib/api/endpoints';
import { useAuthStore } from '../../lib/auth-store';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { accessToken } = mode === 'login'
        ? await login(v)
        : await register({ ...v, role: 'OWNER' });
      useAuthStore.getState().setAuth(accessToken, { id: '', email: v.email, role: 'OWNER' });
      const me = await getMe();
      setAuth(accessToken, me);
      navigate('/pools');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="Swim 管理控制台" style={{ width: 360 }}>
        <Segmented
          block options={[{ label: '登录', value: 'login' }, { label: '注册为 OWNER', value: 'register' }]}
          value={mode} onChange={(v) => setMode(v as 'login' | 'register')} style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {mode === 'login' ? '登录' : '注册'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```
> 注：`register` 分支按钮文案为"注册"，登录分支为"登录"；测试只覆盖登录流。`App.useApp()` 的 `message` 需要外层有 AntD `<App>`（已在 Providers 提供；测试里 renderWithProviders 未含 AntD App —— 故在 `test/render.tsx` 外再包一层不必要；改为：测试用例不触发错误分支即可。若 `App.useApp()` 在测试中报缺少 context，则在 render.tsx 增加 `import { App as AntdApp } from 'antd'` 并用 `<AntdApp>` 包裹 children）。

- [ ] **Step 4: 让 `renderWithProviders` 提供 AntD App context**（避免 `App.useApp()` 报错）

Modify `apps/web/src/test/render.tsx`：在 `MemoryRouter` 内层包 `<AntdApp>`：
```tsx
import { App as AntdApp } from 'antd';
// ...
return render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[route]}>
      <AntdApp>{ui}</AntdApp>
    </MemoryRouter>
  </QueryClientProvider>,
);
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -w @swim/web -- LoginPage`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): 登录/注册为 OWNER 页"
```

---

### Task 7: AppLayout + PoolSwitcher + 登出（TDD）

**Files:**
- Create: `apps/web/src/components/AppLayout.test.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx`（替换占位）

**Interfaces:**
- Consumes: `usePools`、`useAuthStore`、AntD `Layout`、`useNavigate`、`useParams`、`<Outlet/>`。
- Produces: `<AppLayout>` —— 顶栏含品牌、**泳池切换器**（下拉列出 `usePools()`，选中跳 `/pools/:id`）、用户邮箱 + 登出（`clear()` 跳 `/login`）；左侧菜单"总览"（跳 `/pools`）；内容区 `<Outlet/>`。

- [ ] **Step 1: 写失败测试** `apps/web/src/components/AppLayout.test.tsx`

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { AppLayout } from './AppLayout';
import { useAuthStore } from '../lib/auth-store';

beforeEach(() => useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'owner@x.com', role: 'OWNER' }));

it('渲染用户邮箱，登出后跳登录', async () => {
  server.use(http.get('/api/pools', () => HttpResponse.json([])));
  renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}><Route path="/pools" element={<div>内容</div>} /></Route>
      <Route path="/login" element={<div>登录页</div>} />
    </Routes>,
    { route: '/pools' },
  );
  expect(await screen.findByText('owner@x.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /登出/ }));
  await waitFor(() => expect(screen.getByText('登录页')).toBeInTheDocument());
  expect(useAuthStore.getState().token).toBeNull();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- AppLayout`
Expected: FAIL（占位 AppLayout 无邮箱/登出）。

- [ ] **Step 3: 写实现** `apps/web/src/components/AppLayout.tsx`

```tsx
import { Layout, Menu, Select, Button, Space, Typography } from 'antd';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { usePools } from '../lib/queries';
import { useAuthStore } from '../lib/auth-store';

export function AppLayout() {
  const navigate = useNavigate();
  const { poolId } = useParams();
  const { data: pools } = usePools();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const logout = () => { clear(); navigate('/login'); };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Text strong style={{ color: '#fff' }}>Swim 控制台</Typography.Text>
        <Space>
          <Select
            placeholder="切换泳池" style={{ width: 200 }} value={poolId}
            onChange={(id) => navigate(`/pools/${id}`)}
            options={(pools ?? []).map((p) => ({ label: p.name, value: p.id }))}
          />
          <Typography.Text style={{ color: '#fff' }}>{user?.email}</Typography.Text>
          <Button onClick={logout}>登出</Button>
        </Space>
      </Layout.Header>
      <Layout>
        <Layout.Sider theme="light" width={180}>
          <Menu mode="inline" selectable={false} items={[{ key: 'overview', label: '总览', onClick: () => navigate('/pools') }]} />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}><Outlet /></Layout.Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- AppLayout && npm run build -w @swim/web`
Expected: PASS + 构建通过。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): AppLayout + 泳池切换器 + 登出"
```

---

### Task 8: 泳池总览页（汇总卡 + 列表 + 新建泳池）（TDD）

**Files:**
- Create: `apps/web/src/features/pools/PoolForm.tsx`、`apps/web/src/features/dashboard/StatCards.tsx`、`apps/web/src/features/pools/OverviewPage.test.tsx`
- Modify: `apps/web/src/features/pools/OverviewPage.tsx`（替换占位）

**Interfaces:**
- Consumes: `useOverview`、`usePools`、`useCreatePool`、AntD `Table`/`Card`/`Statistic`/`Modal`/`Form`、`useNavigate`。
- Produces:
  - `<StatCards stats={OverviewStats}>` —— 4 张 `Statistic` 卡（泳池数/会员数/活跃会员/本月里程）。
  - `<PoolForm form onFinish initialValues?>` —— 泳池名/地址/经纬度字段（用于新建与编辑）。
  - `<OverviewPage>` —— 顶部 StatCards + "新建泳池"按钮（打开含 PoolForm 的 Modal，提交走 `useCreatePool`）+ 泳池 `Table`（列：名称/会员数/近30天里程；行点击跳 `/pools/:id`）。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/pools/OverviewPage.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { OverviewPage } from './OverviewPage';

const overview = { poolCount: 1, memberCount: 3, activeMemberCount: 2, mileageThisMonthMeters: 5000, sessionsThisMonth: 4 };
const pool = { id: 'p1', name: 'Sunrise', address: null, latitude: null, longitude: null, memberCount: 3, mileageLast30dMeters: 1200, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z' };

it('展示汇总卡与泳池列表', async () => {
  server.use(
    http.get('/api/stats/overview', () => HttpResponse.json(overview)),
    http.get('/api/pools', () => HttpResponse.json([pool])),
  );
  renderWithProviders(<Routes><Route path="/pools" element={<OverviewPage />} /></Routes>, { route: '/pools' });
  expect(await screen.findByText('Sunrise')).toBeInTheDocument();
  expect(screen.getByText('5000')).toBeInTheDocument(); // 本月里程
});

it('新建泳池：提交后刷新列表', async () => {
  let created = false;
  server.use(
    http.get('/api/stats/overview', () => HttpResponse.json(overview)),
    http.get('/api/pools', () => HttpResponse.json(created ? [pool, { ...pool, id: 'p2', name: 'Moonlight' }] : [pool])),
    http.post('/api/pools', async () => { created = true; return HttpResponse.json({ id: 'p2', name: 'Moonlight' }); }),
  );
  renderWithProviders(<Routes><Route path="/pools" element={<OverviewPage />} /></Routes>, { route: '/pools' });
  await screen.findByText('Sunrise');
  await userEvent.click(screen.getByRole('button', { name: /新建泳池/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('名称'), 'Moonlight');
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|提交|创建/ }));
  await waitFor(() => expect(screen.getByText('Moonlight')).toBeInTheDocument());
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- OverviewPage`
Expected: FAIL（占位 OverviewPage）。

- [ ] **Step 3: 写 `StatCards.tsx`**

```tsx
import { Card, Col, Row, Statistic } from 'antd';
import type { OverviewStats } from '@swim/shared';

export function StatCards({ stats }: { stats: OverviewStats }) {
  const items = [
    { title: '泳池数', value: stats.poolCount },
    { title: '会员总数', value: stats.memberCount },
    { title: '活跃会员', value: stats.activeMemberCount },
    { title: '本月里程(米)', value: stats.mileageThisMonthMeters },
  ];
  return (
    <Row gutter={16}>
      {items.map((it) => (
        <Col span={6} key={it.title}><Card><Statistic title={it.title} value={it.value} /></Card></Col>
      ))}
    </Row>
  );
}
```

- [ ] **Step 4: 写 `PoolForm.tsx`**

```tsx
import { Form, FormInstance, Input, InputNumber } from 'antd';
import type { CreatePoolDto } from '@swim/shared';

export function PoolForm({ form, onFinish, initialValues }: {
  form: FormInstance; onFinish: (v: CreatePoolDto) => void; initialValues?: Partial<CreatePoolDto>;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={initialValues}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="address" label="地址"><Input /></Form.Item>
      <Form.Item name="latitude" label="纬度"><InputNumber style={{ width: '100%' }} min={-90} max={90} /></Form.Item>
      <Form.Item name="longitude" label="经度"><InputNumber style={{ width: '100%' }} min={-180} max={180} /></Form.Item>
    </Form>
  );
}
```

- [ ] **Step 5: 写 `OverviewPage.tsx`**

```tsx
import { useState } from 'react';
import { Button, Card, Form, Modal, Space, Table, Skeleton, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { PoolSummary } from '@swim/shared';
import { useOverview, usePools, useCreatePool } from '../../lib/queries';
import { StatCards } from '../dashboard/StatCards';
import { PoolForm } from './PoolForm';

export function OverviewPage() {
  const overview = useOverview();
  const pools = usePools();
  const createPool = useCreatePool();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const submit = async (v: any) => {
    try {
      await createPool.mutateAsync(v);
      setOpen(false); form.resetFields();
    } catch (e: any) { message.error(e?.response?.data?.message ?? '创建失败'); }
  };

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: '会员数', dataIndex: 'memberCount' },
    { title: '近30天里程(米)', dataIndex: 'mileageLast30dMeters' },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {overview.data ? <StatCards stats={overview.data} /> : <Skeleton active />}
      <Card
        title="我的泳池"
        extra={<Button type="primary" onClick={() => setOpen(true)}>新建泳池</Button>}
      >
        <Table<PoolSummary>
          rowKey="id" loading={pools.isLoading} dataSource={pools.data ?? []} columns={columns}
          onRow={(r) => ({ onClick: () => navigate(`/pools/${r.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: '还没有泳池，点击“新建泳池”创建第一个' }}
        />
      </Card>
      <Modal title="新建泳池" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={createPool.isPending} okText="确定">
        <PoolForm form={form} onFinish={submit} />
      </Modal>
    </Space>
  );
}
```

- [ ] **Step 6: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- OverviewPage && npm run build -w @swim/web`
Expected: PASS（2 用例）+ 构建通过。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): 泳池总览页（汇总卡+列表+新建）"
```

---

### Task 9: 单泳池详情 —— 信息 + 编辑 + 归档（TDD）

**Files:**
- Create: `apps/web/src/features/pools/PoolDetailPage.test.tsx`
- Modify: `apps/web/src/features/pools/PoolDetailPage.tsx`（替换占位；本 Task 先做信息/编辑/归档，会员与看板在 Task 10/11 追加到本页）

**Interfaces:**
- Consumes: `usePool`、`useUpdatePool`、`useArchivePool`、`PoolForm`、AntD `Descriptions`/`Modal`/`Popconfirm`、`useParams`/`useNavigate`。
- Produces: `<PoolDetailPage>` —— 顶部泳池信息 `Descriptions` + "编辑"（Modal+PoolForm，走 `useUpdatePool`）+ "归档"（`Popconfirm`，走 `useArchivePool`，成功后回 `/pools`）。会员区/看板区本 Task 留 `// 占位` 注释（后续 Task 填充）。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/pools/PoolDetailPage.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { PoolDetailPage } from './PoolDetailPage';

const detail = { id: 'p1', name: 'Sunrise', address: '街 1 号', latitude: null, longitude: null, archivedAt: null, memberCount: 2, createdAt: '2026-01-01T00:00:00.000Z' };

function mountAt(route = '/pools/p1') {
  server.use(
    http.get('/api/pools/p1', () => HttpResponse.json(detail)),
    http.get('/api/pools/p1/swimmers', () => HttpResponse.json([])),
    http.get('/api/stats/pool/p1', () => HttpResponse.json({ memberCount: 2, activeMemberCount: 2, mileageThisMonthMeters: 0, trend: [], heatmap: [] })),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/pools" element={<div>总览页</div>} />
      <Route path="/pools/:poolId" element={<PoolDetailPage />} />
    </Routes>,
    { route },
  );
}

it('展示泳池信息', async () => {
  mountAt();
  expect(await screen.findByText('Sunrise')).toBeInTheDocument();
  expect(screen.getByText('街 1 号')).toBeInTheDocument();
});

it('归档后返回总览', async () => {
  server.use(http.post('/api/pools/p1/archive', () => HttpResponse.json({ id: 'p1', archivedAt: '2026-06-01T00:00:00.000Z' })));
  mountAt();
  await screen.findByText('Sunrise');
  await userEvent.click(screen.getByRole('button', { name: /归档/ }));
  await userEvent.click(await screen.findByRole('button', { name: /确 定|确定/ }));
  await waitFor(() => expect(screen.getByText('总览页')).toBeInTheDocument());
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- PoolDetailPage`
Expected: FAIL（占位页）。

- [ ] **Step 3: 写实现** `apps/web/src/features/pools/PoolDetailPage.tsx`

```tsx
import { useState } from 'react';
import { Button, Card, Descriptions, Form, Modal, Popconfirm, Skeleton, Space, App } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { usePool, useUpdatePool, useArchivePool } from '../../lib/queries';
import { PoolForm } from './PoolForm';

export function PoolDetailPage() {
  const { poolId = '' } = useParams();
  const pool = usePool(poolId);
  const updatePool = useUpdatePool(poolId);
  const archivePool = useArchivePool();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  if (!pool.data) return <Skeleton active />;
  const p = pool.data;

  const submitEdit = async (v: any) => {
    try { await updatePool.mutateAsync(v); setEditOpen(false); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '更新失败'); }
  };
  const archive = async () => {
    try { await archivePool.mutateAsync(poolId); navigate('/pools'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '归档失败'); }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={p.name}
        extra={
          <Space>
            <Button onClick={() => { form.setFieldsValue(p); setEditOpen(true); }}>编辑</Button>
            <Popconfirm title="归档该泳池？" description="归档后将从列表隐藏（历史数据保留）。" onConfirm={archive}>
              <Button danger>归档</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Descriptions column={2}>
          <Descriptions.Item label="名称">{p.name}</Descriptions.Item>
          <Descriptions.Item label="地址">{p.address ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="会员数">{p.memberCount}</Descriptions.Item>
          <Descriptions.Item label="状态">{p.archivedAt ? '已归档' : '使用中'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 会员名册：Task 10 填充 */}
      {/* 本泳池看板：Task 11 填充 */}

      <Modal title="编辑泳池" open={editOpen} onOk={() => form.submit()} onCancel={() => setEditOpen(false)} confirmLoading={updatePool.isPending} okText="保存">
        <PoolForm form={form} onFinish={submitEdit} />
      </Modal>
    </Space>
  );
}
```

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- PoolDetailPage && npm run build -w @swim/web`
Expected: PASS（2 用例）+ 构建通过。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): 单泳池详情（信息+编辑+归档）"
```

---

### Task 10: 会员名册 + 建会员 + 停用/恢复（TDD）

**Files:**
- Create: `apps/web/src/features/swimmers/RosterTable.tsx`、`apps/web/src/features/swimmers/CreateSwimmerModal.tsx`、`apps/web/src/features/swimmers/RosterTable.test.tsx`
- Modify: `apps/web/src/features/pools/PoolDetailPage.tsx`（在会员占位处挂载 `<RosterTable poolId>`）

**Interfaces:**
- Consumes: `useSwimmers`、`useCreateSwimmer`、`useSetMembership`、AntD `Table`/`Tag`/`Modal`/`Form`、`useNavigate`。
- Produces:
  - `<CreateSwimmerModal poolId open onClose>` —— name+email 表单，走 `useCreateSwimmer`。
  - `<RosterTable poolId>` —— 会员 `Table`（姓名/邮箱/状态 Tag/近30天里程/操作）；行点击跳 `/pools/:poolId/swimmers/:sid`；操作列"停用/恢复"走 `useSetMembership`；顶部"新建会员"打开 Modal。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/swimmers/RosterTable.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RosterTable } from './RosterTable';

const sam = { swimmerId: 's1', name: 'Sam', email: 'sam@x.com', status: 'ACTIVE', claimedAt: null, mileageLast30dMeters: 700, joinedAt: '2026-02-01T00:00:00.000Z' };

it('展示会员并能新建会员', async () => {
  let created = false;
  server.use(
    http.get('/api/pools/p1/swimmers', () => HttpResponse.json(created ? [sam, { ...sam, swimmerId: 's2', name: 'Mei', email: 'mei@x.com' }] : [sam])),
    http.post('/api/pools/p1/swimmers', async () => { created = true; return HttpResponse.json({ ...sam, swimmerId: 's2', name: 'Mei', email: 'mei@x.com' }); }),
  );
  renderWithProviders(<Routes><Route path="*" element={<RosterTable poolId="p1" />} /></Routes>, { route: '/pools/p1' });
  expect(await screen.findByText('Sam')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /新建会员/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('邮箱'), 'mei@x.com');
  await userEvent.type(within(dialog).getByLabelText('姓名'), 'Mei');
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|创建/ }));
  await waitFor(() => expect(screen.getByText('Mei')).toBeInTheDocument());
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- RosterTable`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 `CreateSwimmerModal.tsx`**

```tsx
import { Form, Input, Modal, App } from 'antd';
import { useCreateSwimmer } from '../../lib/queries';

export function CreateSwimmerModal({ poolId, open, onClose }: { poolId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const createSwimmer = useCreateSwimmer(poolId);
  const { message } = App.useApp();

  const submit = async (v: { name?: string; email: string }) => {
    try { await createSwimmer.mutateAsync(v); form.resetFields(); onClose(); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '创建失败'); }
  };

  return (
    <Modal title="新建会员" open={open} onOk={() => form.submit()} onCancel={onClose} confirmLoading={createSwimmer.isPending} okText="确定">
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}><Input /></Form.Item>
        <Form.Item name="name" label="姓名"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 4: 写 `RosterTable.tsx`**

```tsx
import { useState } from 'react';
import { Button, Card, Space, Table, Tag, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { SwimmerListItem } from '@swim/shared';
import { useSwimmers, useSetMembership } from '../../lib/queries';
import { CreateSwimmerModal } from './CreateSwimmerModal';

export function RosterTable({ poolId }: { poolId: string }) {
  const swimmers = useSwimmers(poolId);
  const setMembership = useSetMembership(poolId);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const toggle = async (r: SwimmerListItem) => {
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await setMembership.mutateAsync({ sid: r.swimmerId, body: { status: next } }); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '操作失败'); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? '活跃' : '停用'}</Tag> },
    { title: '近30天里程(米)', dataIndex: 'mileageLast30dMeters' },
    {
      title: '操作', key: 'op',
      render: (_: unknown, r: SwimmerListItem) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); toggle(r); }}>
          {r.status === 'ACTIVE' ? '停用' : '恢复'}
        </Button>
      ),
    },
  ];

  return (
    <Card title="会员名册" extra={<Button type="primary" onClick={() => setOpen(true)}>新建会员</Button>}>
      <Table<SwimmerListItem>
        rowKey="swimmerId" loading={swimmers.isLoading} dataSource={swimmers.data ?? []} columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/pools/${poolId}/swimmers/${r.swimmerId}`), style: { cursor: 'pointer' } })}
        locale={{ emptyText: '还没有会员，点击“新建会员”添加' }}
      />
      <CreateSwimmerModal poolId={poolId} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
```

- [ ] **Step 5: 在 PoolDetailPage 挂载 RosterTable**

Modify `apps/web/src/features/pools/PoolDetailPage.tsx`：把 `{/* 会员名册：Task 10 填充 */}` 替换为 `<RosterTable poolId={poolId} />`，并在顶部 import：`import { RosterTable } from '../swimmers/RosterTable';`

- [ ] **Step 6: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- RosterTable PoolDetailPage && npm run build -w @swim/web`
Expected: PASS（RosterTable 用例 + 既有 PoolDetail 用例仍绿）+ 构建通过。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): 会员名册 + 建会员 + 停用/恢复"
```

---

### Task 11: 本泳池看板（汇总 + 热力图 + 趋势）（TDD）

**Files:**
- Create: `apps/web/src/features/dashboard/HeatmapCard.tsx`、`apps/web/src/features/dashboard/TrendChart.tsx`、`apps/web/src/features/dashboard/PoolDashboard.tsx`、`apps/web/src/features/dashboard/PoolDashboard.test.tsx`
- Modify: `apps/web/src/features/pools/PoolDetailPage.tsx`（在看板占位处挂载 `<PoolDashboard poolId>`）

**Interfaces:**
- Consumes: `usePoolStats`、`@uiw/react-heat-map`、`recharts`、AntD `Card`/`Statistic`。
- Produces:
  - `<HeatmapCard cells={HeatmapCell[]} year>` —— 用 `@uiw/react-heat-map` 渲染日历热力图（value=distanceMeters）。
  - `<TrendChart cells={HeatmapCell[]}>` —— recharts 折线图（x=date, y=distanceMeters）。
  - `<PoolDashboard poolId>` —— 顶部 3 个 `Statistic`（会员数/活跃/本月里程）+ TrendChart + HeatmapCard，数据来自 `usePoolStats`。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/dashboard/PoolDashboard.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { PoolDashboard } from './PoolDashboard';

it('展示本泳池统计', async () => {
  server.use(http.get('/api/stats/pool/p1', () => HttpResponse.json({
    memberCount: 5, activeMemberCount: 4, mileageThisMonthMeters: 8000,
    trend: [{ date: '2026-02-01', distanceMeters: 1000 }],
    heatmap: [{ date: '2026-02-01', distanceMeters: 1000 }],
  })));
  renderWithProviders(<PoolDashboard poolId="p1" />);
  expect(await screen.findByText('8000')).toBeInTheDocument(); // 本月里程
  expect(screen.getByText('本月里程(米)')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- PoolDashboard`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 `HeatmapCard.tsx`**

```tsx
import { Card } from 'antd';
import HeatMap from '@uiw/react-heat-map';
import type { HeatmapCell } from '@swim/shared';

export function HeatmapCard({ cells, year = new Date().getUTCFullYear() }: { cells: HeatmapCell[]; year?: number }) {
  const value = cells.map((c) => ({ date: c.date.replace(/-/g, '/'), count: c.distanceMeters }));
  return (
    <Card title="活动热力图">
      <HeatMap
        value={value}
        startDate={new Date(`${year}/01/01`)}
        endDate={new Date(`${year}/12/31`)}
        width={760}
        rectSize={11}
      />
    </Card>
  );
}
```

- [ ] **Step 4: 写 `TrendChart.tsx`**

```tsx
import { Card } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HeatmapCell } from '@swim/shared';

export function TrendChart({ cells }: { cells: HeatmapCell[] }) {
  return (
    <Card title="里程趋势">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={cells}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" /><YAxis /><Tooltip />
          <Line type="monotone" dataKey="distanceMeters" stroke="#1677ff" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

- [ ] **Step 5: 写 `PoolDashboard.tsx`**

```tsx
import { Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { usePoolStats } from '../../lib/queries';
import { HeatmapCard } from './HeatmapCard';
import { TrendChart } from './TrendChart';

export function PoolDashboard({ poolId }: { poolId: string }) {
  const stats = usePoolStats(poolId);
  if (!stats.data) return <Skeleton active />;
  const s = stats.data;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="会员数" value={s.memberCount} /></Card></Col>
        <Col span={8}><Card><Statistic title="活跃会员" value={s.activeMemberCount} /></Card></Col>
        <Col span={8}><Card><Statistic title="本月里程(米)" value={s.mileageThisMonthMeters} /></Card></Col>
      </Row>
      <TrendChart cells={s.trend} />
      <HeatmapCard cells={s.heatmap} />
    </Space>
  );
}
```

- [ ] **Step 6: 挂载到 PoolDetailPage**

Modify `apps/web/src/features/pools/PoolDetailPage.tsx`：把 `{/* 本泳池看板：Task 11 填充 */}` 替换为 `<PoolDashboard poolId={poolId} />`，import：`import { PoolDashboard } from '../dashboard/PoolDashboard';`

- [ ] **Step 7: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- PoolDashboard PoolDetailPage && npm run build -w @swim/web`
Expected: PASS + 构建通过。
> 断言仅针对 `Statistic` 文案（已如此）。ResponsiveContainer 在 jsdom 下宽高为 0、recharts/热力图可能告警但不影响断言。**若任一图表库在 jsdom 下抛错**导致测试挂掉，在该测试文件顶部 mock 掉它们：`vi.mock('@uiw/react-heat-map', () => ({ default: () => null }))` 和 `vi.mock('recharts', async (orig) => ({ ...(await orig()), ResponsiveContainer: ({ children }: any) => children }))`，再断言 `Statistic` 文案。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): 本泳池看板（汇总+趋势+热力图）"
```

---

### Task 12: 游泳者详情 + 代录（TDD）

**Files:**
- Create: `apps/web/src/features/sessions/RecordSessionModal.tsx`、`apps/web/src/features/swimmers/SwimmerDetailPage.test.tsx`
- Modify: `apps/web/src/features/swimmers/SwimmerDetailPage.tsx`（替换占位）

**Interfaces:**
- Consumes: `useSwimmerStats`、`useRecordSession`、`HeatmapCard`、AntD `Statistic`/`Modal`/`Form`/`InputNumber`/`DatePicker`、`useParams`。
- Produces:
  - `<RecordSessionModal poolId sid open onClose>` —— distanceMeters(必填,≥1)+durationSeconds(可选)+swamAt(DatePicker→ISO) 表单，走 `useRecordSession`。
  - `<SwimmerDetailPage>` —— 汇总 `Statistic`（总里程/次数/总时长）+ 个人 HeatmapCard + "代录"按钮（打开 RecordSessionModal）。

- [ ] **Step 1: 写失败测试** `apps/web/src/features/swimmers/SwimmerDetailPage.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SwimmerDetailPage } from './SwimmerDetailPage';

const stats0 = { summary: { totalDistanceMeters: 3000, totalDurationSeconds: 1800, sessionCount: 4 }, heatmap: [] };

function mount() {
  return renderWithProviders(
    <Routes><Route path="/pools/:poolId/swimmers/:sid" element={<SwimmerDetailPage />} /></Routes>,
    { route: '/pools/p1/swimmers/s1' },
  );
}

it('展示汇总并代录一次', async () => {
  let recorded = false;
  server.use(
    http.get('/api/stats/swimmer/s1', () => HttpResponse.json(recorded
      ? { ...stats0, summary: { ...stats0.summary, sessionCount: 5 } } : stats0)),
    http.post('/api/pools/p1/swimmers/s1/sessions', async () => { recorded = true; return HttpResponse.json({ id: 'ss1' }); }),
  );
  mount();
  expect(await screen.findByText('3000')).toBeInTheDocument(); // 总里程
  await userEvent.click(screen.getByRole('button', { name: /代录/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('距离(米)'), '1000');
  // swamAt: 用 DatePicker 默认（测试只需必填距离即可提交；若 DatePicker 必填，见实现说明）
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|提交/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- SwimmerDetailPage`
Expected: FAIL（占位页）。

- [ ] **Step 3: 写 `RecordSessionModal.tsx`**

```tsx
import { DatePicker, Form, InputNumber, Modal, App } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useRecordSession } from '../../lib/queries';

export function RecordSessionModal({ poolId, sid, open, onClose }: { poolId: string; sid: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const record = useRecordSession(poolId, sid);
  const { message } = App.useApp();

  const submit = async (v: { distanceMeters: number; durationSeconds?: number; swamAt?: Dayjs }) => {
    try {
      await record.mutateAsync({
        distanceMeters: v.distanceMeters,
        durationSeconds: v.durationSeconds,
        swamAt: (v.swamAt ?? dayjs()).toISOString(),
      });
      form.resetFields(); onClose();
    } catch (e: any) { message.error(e?.response?.data?.message ?? '代录失败'); }
  };

  return (
    <Modal title="代录游泳" open={open} onOk={() => form.submit()} onCancel={onClose} confirmLoading={record.isPending} okText="确定">
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ swamAt: dayjs() }}>
        <Form.Item name="distanceMeters" label="距离(米)" rules={[{ required: true, type: 'number', min: 1, message: '距离需 ≥ 1' }]}>
          <InputNumber style={{ width: '100%' }} min={1} />
        </Form.Item>
        <Form.Item name="durationSeconds" label="时长(秒)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
        <Form.Item name="swamAt" label="日期" rules={[{ required: true, message: '请选择日期' }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  );
}
```
> `dayjs` 随 AntD 一起安装（AntD 5 依赖 dayjs），无需单独加依赖。测试里 `swamAt` 有 `initialValues` 默认当天，故只填距离即可提交。

- [ ] **Step 4: 写 `SwimmerDetailPage.tsx`**

```tsx
import { useState } from 'react';
import { Button, Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { useParams } from 'react-router-dom';
import { useSwimmerStats } from '../../lib/queries';
import { HeatmapCard } from '../dashboard/HeatmapCard';
import { RecordSessionModal } from '../sessions/RecordSessionModal';

export function SwimmerDetailPage() {
  const { poolId = '', sid = '' } = useParams();
  const stats = useSwimmerStats(sid);
  const [open, setOpen] = useState(false);
  if (!stats.data) return <Skeleton active />;
  const s = stats.data.summary;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="游泳者" extra={<Button type="primary" onClick={() => setOpen(true)}>代录</Button>}>
        <Row gutter={16}>
          <Col span={8}><Statistic title="总里程(米)" value={s.totalDistanceMeters} /></Col>
          <Col span={8}><Statistic title="游泳次数" value={s.sessionCount} /></Col>
          <Col span={8}><Statistic title="总时长(秒)" value={s.totalDurationSeconds} /></Col>
        </Row>
      </Card>
      <HeatmapCard cells={stats.data.heatmap} />
      <RecordSessionModal poolId={poolId} sid={sid} open={open} onClose={() => setOpen(false)} />
    </Space>
  );
}
```

- [ ] **Step 5: 运行确认通过 + 构建**

Run: `npm test -w @swim/web -- SwimmerDetailPage && npm run build -w @swim/web`
Expected: PASS + 构建通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): 游泳者详情 + 代录"
```

---

### Task 13: ErrorBoundary + 全量回归 + 收尾（TDD）

**Files:**
- Create: `apps/web/src/components/ErrorBoundary.tsx`、`apps/web/src/components/ErrorBoundary.test.tsx`
- Modify: `apps/web/src/app/providers.tsx`（用 `<ErrorBoundary>` 包裹 children）

**Interfaces:**
- Produces: `<ErrorBoundary>`（class 组件；`componentDidCatch` 渲染 AntD `Result status="error"` + "刷新"按钮）。

- [ ] **Step 1: 写失败测试** `apps/web/src/components/ErrorBoundary.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): JSX.Element { throw new Error('boom'); }

it('捕获子组件错误并显示兜底 UI', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Boom /></ErrorBoundary>);
  expect(screen.getByText(/出错了|页面错误/)).toBeInTheDocument();
  spy.mockRestore();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @swim/web -- ErrorBoundary`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 `ErrorBoundary.tsx`**

```tsx
import { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { /* 可接入上报 */ }
  render() {
    if (this.state.hasError) {
      return <Result status="error" title="出错了" subTitle="页面发生异常，请刷新重试。"
        extra={<Button type="primary" onClick={() => window.location.reload()}>刷新</Button>} />;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: 在 Providers 包裹 ErrorBoundary**

Modify `apps/web/src/app/providers.tsx`：import `ErrorBoundary`，把 `<AntdApp>{children}</AntdApp>` 包成 `<AntdApp><ErrorBoundary>{children}</ErrorBoundary></AntdApp>`。

- [ ] **Step 5: 全量回归 + 构建**

Run: `npm test -w @swim/web && npm run build -w @swim/web`
Expected: 所有测试 PASS（含 Task 1-12）+ `vite build` 通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): ErrorBoundary + 全量回归通过"
```

---

## 完成后

前端 SPA 完成：登录/注册为 OWNER、泳池总览（汇总+列表+新建）、单泳池（信息/编辑/归档 + 会员名册 + 看板）、游泳者详情（汇总+热力图+代录），全部走 `@swim/shared` 类型对接真实后端。

**端到端联调（需后端运行 + DB）**：`npm run dev:api` 起后端、`npm run dev -w @swim/web` 起前端（Vite proxy 转发 `/api`），用 OWNER 账号走通全流程；此步依赖 PostGIS Postgres（见后端 Plan 的 deferred 项）。
