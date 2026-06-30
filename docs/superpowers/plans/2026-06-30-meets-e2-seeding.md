# 赛事 E2 分组泳道 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-30-meets-e2-seeding-design.md`。分支 `feat/meets-e2-seeding`。

## Task 1 — 排道纯函数（红→绿）
- `meets/seeding.ts`：`lanePriority(laneCount)` + `seedHeats(entries, laneCount)`。
- `seeding.spec.ts`：lanePriority 6/8 道；seedHeats 最快进末组中心道、无种子排最后、整除/余数/单组/空。

## Task 2 — shared + Prisma + 迁移
- shared：`EntryItem` += heat/lane；`MeetSummary` += laneCount；`CreateMeetDto` += laneCount。`npm run build -w @swim/shared`。
- Prisma：`Meet.laneCount Int @default(6)`、`MeetEntry.heat Int?`/`lane Int?`。
- 手写迁移 `20260630030000_meets_seeding`：ALTER Meet ADD laneCount、ALTER MeetEntry ADD heat/lane。generate + dev deploy。

## Task 3 — MeetsService + 端点（红→绿）
- `CreateMeetBody` += `@IsOptional() @IsInt() @Min(1) @Max(20) laneCount?`；createMeet 落 laneCount；summary/detail 返回 laneCount。
- `toEntryItem` += heat/lane。
- `seedEvent(ownerId, eventId)`：ownEvent → meet.laneCount；取 entries(id, seedTimeMs)；seedHeats；`$transaction` 批量 update heat/lane；返回 listEntries。
- 控制器：`POST /events/:eid/seed`。
- spec 补：createMeet laneCount、seedEvent（mock prisma：取 laneCount、update 调用、返回含 heat/lane）。
- 跑 api 单测全绿。

## Task 4 — e2e
- `meets-flows` 补或新 `meets-seeding.e2e`：建赛(laneCount 6)→项目→报 8 人(种子成绩 1..8)→`POST /events/:eid/seed`→`GET entries` 断言最快者 heat=末组&lane=中心、第 7/8 名 heat=1。
- 跑 e2e 全绿。

## Task 5 — 前端
- endpoints `seedEvent`；queries `useSeedEvent`。
- MeetsListPage 新建表单加「泳道数」(默认 6)。
- MeetDetailPage：项目面板加「排道」按钮；「出发名单」卡（entries 按 heat 分组、组内按 lane 升序，显示 道次/姓名/种子成绩）。
- swim-time：种子成绩格式化复用 formatSwimTime。
- 测试：排道后出发名单按 heat 渲染。
- 跑 web 单测全绿。

## Task 6 — 终验
- 全量门禁；README 增分组泳道段；自评审；合并 main + 推送 + 删分支；通知。
