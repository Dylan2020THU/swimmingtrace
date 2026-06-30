# 赛事 E3 公开赛事页 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-30-meets-e3-public-design.md`。分支 `feat/meets-e3-public`。

## Task 1 — shared + Prisma + 迁移
- shared：`MeetSummary` += published；`PublicRaceEvent/PublicMeet/PublicStartListEntry/PublicStartListHeat`；`SetPublishedDto`。`npm run build -w @swim/shared`。
- Prisma：`Meet.published Boolean @default(false)`。手写迁移 `20260630040000_meet_published`。generate + dev deploy。

## Task 2 — MeetsService 公开方法 + setPublished（红→绿）
- `MeetsService`：createMeet/listMeets/meetDetail 返回 published；`setPublished(ownerId, meetId, published)`（ownMeet + update）。
- 公开（无 ownerId）：`publicMeet(id)`、`publicStartList(eventId)`、`publicResults(eventId)` —— 各查 published，否则 `NotFoundException`；startlist 仅 `{lane,name,seedTimeMs}`、results 复用 computeStandings。
- `meets.service.spec` 补：setPublished 所有权；publicMeet 未发布→404、已发布→投影；publicStartList 无 email。

## Task 3 — 控制器
- `MeetsController`：`POST /meets/:id/publish`（`SetPublishedBody`）。
- `PublicMeetsController`（新文件，**无 @UseGuards/@Roles**，@ApiTags('public')）：`GET /public/meets/:id`、`GET /public/events/:eid/startlist`、`GET /public/events/:eid/results`。
- 注册到 MeetsModule（controllers 加 PublicMeetsController）。
- 跑 api 单测全绿。

## Task 4 — e2e
- `meets-public.e2e`：建赛(PRO)→项目→报名(种子)→排道→录成绩→`publish{true}`→`GET /public/meets/:id` 200 含 events；`/startlist` 有 lane/name 且 **JSON 不含 @**(email)；`/results` 有 rank；`publish{false}`→公开 404；未发布另赛事公开 404。
- 跑 e2e 全绿。

## Task 5 — 前端
- endpoints `publishMeet`、`getPublicMeet/getPublicStartList/getPublicResults`；queries `usePublishMeet`、`usePublicMeet` 等。
- owner MeetDetailPage：赛事头加「公开」Switch + 「复制公开链接」。
- 公开页：`features/meets/MeetPublicPage.tsx`（赛事头 + 项目选择 → 出发名单/成绩只读）；路由 `/p/meets/:meetId`（router 免登录区）。
- 测试：公开页渲染；owner 公开开关。
- 跑 web 单测全绿。

## Task 6 — 终验
- 全量门禁；README 增公开页段；自评审（grep 公开响应无 email）；合并 main + 推送 + 删分支；通知。
