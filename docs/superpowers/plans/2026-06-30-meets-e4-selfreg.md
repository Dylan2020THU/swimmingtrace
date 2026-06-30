# 赛事 E4 自助报名 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-30-meets-e4-selfreg-design.md`。分支 `feat/meets-e4-selfreg`。

## Task 1 — shared + Prisma + 迁移
- shared：`MeetSummary` += registrationOpen；`UpdateProfileDto`、`SetRegistrationDto`、`SelfEntryDto`、`MyMeetEvent`、`MyMeet`。build。
- Prisma：`Meet.registrationOpen Boolean @default(false)`。迁移 `20260630050000_meet_registration_open`。generate + deploy。

## Task 2 — owner 开关 + 公开/汇总含 registrationOpen（红→绿）
- `MeetsService.setRegistrationOpen(ownerId, meetId, open)`；createMeet/listMeets/meetDetail 返回 registrationOpen。
- `MeetsController` `POST /meets/:id/registration`（SetRegistrationBody）。
- spec 补 setRegistrationOpen。

## Task 3 — 游泳者自助方法 + me/profile（红→绿）
- `MeetsService`：`myOpenMeets(swimmerId)`、`selfRegister(swimmerId, eventId, dto)`（开放/会员/资料/重复校验）、`withdrawOwn(swimmerId, entryId)`。
- `MeService.updateProfile(userId, { gender, birthDate })`。
- `SwimmerMeetsController`（meets 模块，`@Roles(SWIMMER)`）：`GET /me/meets`、`POST /me/meets/events/:eid/entries`、`DELETE /me/meets/entries/:enid`。
- `MeController` += `PATCH /me/profile`（`UpdateProfileBody`）。
- spec：selfRegister 各分支、withdrawOwn、updateProfile、myOpenMeets。
- 跑 api 单测全绿。

## Task 4 — e2e
- `meets-selfreg.e2e`：owner 建赛+项目+开放报名→建会员+认领得 swimmer token→`PATCH /me/profile` 补资料→`GET /me/meets` 见赛事→`POST 自报`→owner `GET entries` 含该条目→swimmer 撤回→消失；未开放自报 403；缺资料 422。
- 跑 e2e 全绿。

## Task 5 — 前端
- owner（web）：MeetDetailPage 加「开放报名」开关（endpoints/queries setRegistrationOpen）。
- swimmer（apps/swimmer）：endpoints/queries（getMyMeets/selfRegister/withdraw/updateProfile）；「赛事」页（列开放赛事、补资料弹窗、报名/撤回）；导航入口；swim-time 助手（parse/format）。
- 测试：swimmer 赛事页报名流；owner 开关。
- 跑 web + swimmer 单测全绿。

## Task 6 — 终验
- 全量门禁；README 增自助报名段；自评审；合并 main + 推送 + 删分支；通知。
