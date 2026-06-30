# 赛事平台 E3：公开赛事页（免登录分享）

> 承接 E1/E2。canonical：本 spec。每场赛事可发布一个免登录公开页（赛程 / 出发名单 / 成绩名次）。安全敏感：严格 PII 投影。

## 目标

owner 把赛事**发布**为公开；任何人凭链接 `/p/meets/:id` 免登录查看**赛程、出发名单、成绩/名次**。未发布 → 404。

## 数据

- `Meet` 加 `published Boolean @default(false)`。一条迁移。
- `MeetSummary` 加 `published: boolean`（owner UI 知道状态）。

## 后端

**owner（已鉴权）**
- `POST /meets/:id/publish` 体 `{ published }` → 切换；所有权校验。

**公开（无鉴权，绕过 JwtAuthGuard，仍受全局限流）—— 专用安全投影**
- `GET /public/meets/:id` → `PublicMeet`（仅 published，否则 404）：`{ id, name, meetDate, hostPoolName, laneCount, events[] }`。
- `GET /public/events/:eid/startlist` → `PublicStartListHeat[]`（仅其 meet published）：按 heat 分组，每行 `{ lane, name, seedTimeMs }`。
- `GET /public/events/:eid/results` → `StandingsGroup[]`（复用；本就只含 姓名/名次/成绩，无 PII）。

**安全投影（强约束）**
- 公开端点**绝不**复用含 `email` 的 `EntryItem`；只露 姓名 + 道次/种子成绩 + 年龄组/名次/成绩。
- **不露**：邮箱、owner 信息、**出生日期**（只露年龄组）。
- 未发布的 meet/event 一律 `404`（不泄漏存在性差异：统一 404）。

## shared

- `MeetSummary` += `published`。
- `PublicRaceEvent { id, distanceMeters, stroke, order, entryCount }`。
- `PublicMeet { id, name, meetDate, hostPoolName, laneCount, events: PublicRaceEvent[] }`。
- `PublicStartListEntry { lane, name, seedTimeMs }`；`PublicStartListHeat { heat, entries: PublicStartListEntry[] }`。
- 公开成绩复用 `StandingsGroup`。
- `SetPublishedDto { published: boolean }`。

## 前端

- owner 赛事详情：「**公开**」开关（调 publish）+「复制公开链接」（`{origin}/p/meets/:id`）。
- 公开页路由 `/p/meets/:id`（web 应用内、**ProtectedRoute 之外**的免登录路由；Providers 提供 QueryClient/Antd，无需登录）：
  - 赛事头（名/日期/主办泳池）+ 项目列表 → 选项目看**出发名单 / 成绩**（复用 E1/E2 的只读渲染，无任何操作按钮）。
  - 404/未发布 → 友好「赛事不存在或未公开」。

## 测试

- 单测：`setPublished`（所有权 + 切换）；`publicMeet/publicStartList/publicResults`（未发布→404、已发布→投影；断言**不含 email**）。
- e2e：建赛→排道→录成绩→`POST publish {true}`→公开 `GET /public/meets/:id` 200、`/startlist` 有道次无 email、`/results` 有名次；`publish {false}` 后公开端点 404；未发布的另一赛事公开 404。
- web：公开页渲染赛程/出发名单/成绩；owner 公开开关切换。

## 非目标（E3）

公开页搜索/聚合、实时刷新、SEO/OG、自定义域名/slug、嵌入、公开报名（E4）。

## 验收门

lint/build/test/e2e 全绿；README 增公开页；自评审（无 PII 泄漏）；合并 main。
