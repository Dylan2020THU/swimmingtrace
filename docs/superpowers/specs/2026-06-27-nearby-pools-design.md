# 附近泳池（只读发现）· Phase 2-D 设计

- **日期**：2026-06-27
- **分支**：feat/phase2-nearby（从 feat/phase2-morph 切出，复用 A 的 apps/swimmer）
- **状态**：已确认（用户授权自主推进，跳过 spec 复审）
- **上游**：[[2026-06-26-owner-console-phase1-design]] Phase 2 拆解之第四个（最后）子项目

---

## 1. 背景与定位

权威愿景的 Phase 2 含"附近泳池"（偏游泳者场景）。后端 `GET /places/nearby`（PostGIS `ST_DWithin`/`ST_Distance`）在 Phase 1 即存在但前端从未消费、且无测试。本子项目（D，Phase 2 收尾）落地游泳者端**只读**的"附近泳池发现"，并补上该 PostGIS 查询的端到端测试。

按 YAGNI：**只读发现**（不做自助加入泳池——更大产品决策另议）、**列表**（不渲染地图）、**无新数据模型**。

## 2. 目标与非目标

### 目标
- 游泳者在移动端「我的」页进入「附近泳池」→ 浏览器定位 → 列出附近泳池（名称/地址/距离），按距离升序。
- 定位被拒/不可用 → 退回手填经纬度 + 搜索。
- 把 `NearbyPlace` 类型提到 `@swim/shared`；补 `/places/nearby` 的 e2e（PostGIS）。

### 非目标
- 自助加入泳池（`POST /pools/:id/register`）、地图渲染、owner 侧、新数据模型/迁移。
- 第 5 个 TabBar（入口放「我的」，定位发现属次级、用户主动触发）。

## 3. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 只读发现，不做自助加入 | 不改"owner 主导会员"模型；自助加入是更大产品/安全决策 |
| D2 | 入口在「我的」页条目 → `/nearby`，**不加第 5 Tab** | 定位发现次级；用户主动点开再请求定位授权（不在常驻 Tab 静默索权） |
| D3 | 列表而非地图 | 复用 antd-mobile List，零地图依赖，移动端够用 |
| D4 | 定位用浏览器 `navigator.geolocation`，拒绝则手填 | 移动端自然方式；手填保证可用性与可测性 |
| D5 | `NearbyPlace` 提到 `@swim/shared` | 前端强类型消费；后端 places.service 复用同一类型 |

## 4. 后端

- `GET /places/nearby?lat=&lng=&radiusMeters=`（`@UseGuards(JwtAuthGuard)`，任意已登录用户）——**已实现**：lat/lng 缺失或非数字 → 400（Phase 1 已加）；PostGIS 半径搜索，按距离升序，`LIMIT 50`。本期仅把返回类型对齐 shared。
- 类型（`@swim/shared`）：`export interface NearbyPlace { id: string; name: string; address: string | null; latitude: number; longitude: number; distanceMeters: number; }`；`places.service.ts` 改为 `import { NearbyPlace } from '@swim/shared'`（删本地重复 interface）。
- **e2e**（新 `apps/api/test/places-flows.e2e-spec.ts`）：建 owner+带经纬度的泳池（如北京 39.98/116.31）→ `GET /places/nearby` 近点（同城）返回该池且 `distanceMeters` 合理（含 < 半径）→ 远点（如上海 31.23/121.50，radius 5km）不返回它。验证 PostGIS `ST_DWithin`/`ST_Distance`。

## 5. 前端（apps/swimmer）

- **端点/hook**：`getNearbyPlaces(lat, lng, radiusMeters?)`（默认 5000）→ `useNearbyPlaces(coords | null)`（`enabled: !!coords`，queryKey `['nearby', lat, lng, radius]`）。
- **入口**：`ProfilePage`（「我的」）加一条 `List.Item`「附近泳池」→ `navigate('/nearby')`。
- **路由**：受保护区加 `/nearby` → `NearbyPoolsPage`（在 `AppShell` 内，TabBar 仍 4 项）。
- **`NearbyPoolsPage`**：
  - 进入即尝试 `navigator.geolocation.getCurrentPosition`：成功 → 存 `{lat,lng}` 触发查询；失败/不支持 → `manualMode`。
  - 有结果 → antd-mobile `List`，每项 名称 / 地址 / 距离（`formatDistance`：≥1000m 显示 `x.x km`，否则 `xxx m`）。
  - `manualMode` → 两个 `Input`（纬度/经度）+「搜索」按钮，提交即查询。
  - 状态：定位中 `DotLoading`；查询错误 `ErrorBlock`；空 → 文案「附近 5 公里内没有找到泳池」。

## 6. 错误处理
- 后端沿用：缺/非法 lat/lng → 400。
- 前端：geolocation 失败 → 切手填（不报错打断）；`/places/nearby` 失败 → `ErrorBlock`；空 → 文案。

## 7. 测试（TDD）
- **后端 e2e**：§4（近返回/远排除/距离合理）。
- **游泳者前端**（Vitest/RTL/MSW）：
  - mock `navigator.geolocation.getCurrentPosition`（成功回调）+ `/places/nearby` → 渲染泳池名 + 距离。
  - mock geolocation 失败 → 显示手填表单；填经纬度搜索 → 渲染列表。
  - `ProfilePage`：含「附近泳池」入口（点击跳 `/nearby`）。

## 8. 实现顺序（供 writing-plans）
1. shared `NearbyPlace`；places.service 改用之。
2. 后端 places e2e。
3. 游泳者端点/hook + `NearbyPoolsPage`（TDD）+ 路由 + 「我的」入口。
4. 终验 + 自评审。
