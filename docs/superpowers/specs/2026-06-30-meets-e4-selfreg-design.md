# 赛事平台 E4：自助报名（游泳者端）

> 承接 E1-E3。canonical：本 spec。游泳者在游泳者端自助报名 owner 已开放的赛事。范围：**内部自助**（本会员对所属 owner 的赛事），不含跨泳池/公开报名。

## 目标

owner 切「开放报名」后，游泳者在**游泳者端**自填资料并**自助报名**项目（填种子成绩），可撤回；owner 报名席含自报条目，排道/成绩照常。

## 数据

- `Meet` 加 `registrationOpen Boolean @default(false)`。一条迁移。
- `MeetSummary` 加 `registrationOpen: boolean`（owner UI 知道状态）。

## 后端

**owner（已鉴权）**
- `POST /meets/:id/registration` 体 `{ registrationOpen }` → 切换；所有权校验。

**游泳者（`@Roles(SWIMMER)`，新）**
- `PATCH /me/profile` 体 `{ gender?, birthDate? }` → 自填性别/出生日期（`MeService.updateProfile`）。
- `GET /me/meets` → 我所属（ACTIVE 登记）owner 的**已开放报名**赛事：`MyMeet[]`（含项目 + 我的报名 id/种子成绩）。
- `POST /me/meets/events/:eid/entries` 体 `{ seedTimeMs? }` → 给自己报名。校验：该赛事 `registrationOpen`、我是其 owner 名下池 **ACTIVE** 会员、我有 gender+birthDate（否则 `422`）、未重复（否则 `409`）。
- `DELETE /me/meets/entries/:enid` → 撤回自己的报名（仅 `resultStatus===ENTERED` 且属于自己，否则 403）。

**安全/约束**
- 自报严格限**本会员**：`registration.findFirst({ swimmerId:self, status:'ACTIVE', pool:{ ownerId: meet.ownerId } })`，否则 `403`。
- 撤回仅限本人条目且未出成绩。
- `me/meets` 仅露赛事/项目/我的报名（不露他人 PII）。

## shared

- `MeetSummary` += `registrationOpen`。
- `UpdateProfileDto { gender?: Gender; birthDate?: string }`。
- `SetRegistrationDto { registrationOpen: boolean }`。
- `SelfEntryDto { seedTimeMs?: number | null }`。
- `MyMeetEvent { id, distanceMeters, stroke, order, myEntryId: string | null, mySeedTimeMs: number | null }`。
- `MyMeet { id, name, meetDate, hostPoolName, events: MyMeetEvent[] }`。

## 前端

**owner（web）**：赛事详情加「**开放报名**」开关（与「公开」并列）。

**游泳者端（apps/swimmer，antd-mobile）**：新增「**赛事**」页（导航入口）：
- 列出可报名赛事（名/日期/主办泳池）→ 每赛事列项目，每项目「**报名**」（填种子成绩 mm:ss.SS）/「**撤回**」。
- 若缺 性别/出生日期：先弹「补全资料」（性别 + 生日）→ 调 `me/profile`。
- 显示「我的报名」状态。

## 测试

- 单测：`updateProfile`；`selfRegister`（未开放→403、非会员→403、缺资料→422、重复→409、成功）；`withdrawOwn`（非本人→403、已出成绩→403）；`myOpenMeets`（仅开放 + 我所属）。
- e2e：owner 开放报名→游泳者(认领)补资料→`GET /me/meets` 见赛事→自报→owner `GET entries` 见该条目→游泳者撤回→消失；未开放自报 403；缺资料 422。
- swimmer app：赛事页报名流（补资料 + 报名）。

## 非目标（E4）

跨泳池/公开（非会员）报名、报名费/支付、报名截止时间、候补、批量。E5 纪录积分在最后。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增自助报名；自评审；合并 main。
