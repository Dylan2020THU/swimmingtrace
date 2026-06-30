# 赛事平台 E1：赛事核心（Meets / 项目 / 报名 / 成绩 / 名次·奖牌）

> 「赛事平台」大子系统的第一片（MVP）。canonical：本 spec。E2-E5（分组泳道 / 公开页 / 公开报名 / 纪录积分）为后续，非本片范围。
> 与现有「挑战赛」（集体里程目标）并存且不同：本片是**计时项目 + 名次/奖牌**的正式赛事。

## 目标

owner 能在控制台办一场赛事：**赛事**（名称/日期/主办泳池）→ **比赛项目**（距离+泳姿）→ **内部报名**（名下任意泳池的会员）→ **成绩录入**（完赛时间/状态）→ **自动名次 + 奖牌**（按 性别×年龄组 分组）。

## 范围

**会员人口学（先决）**
- `User` 加 `gender(Gender?)` + `birthDate(DateTime?)`。名册「新建/编辑会员」可填。报名某项目前该会员必须有 gender + birthDate（否则报名返回 422，无法归组）。

**数据模型（新，一条迁移）**
- 枚举 `Gender { MALE, FEMALE }`、`Stroke { FREE, BACK, BREAST, FLY, IM }`、`ResultStatus { ENTERED, OK, DNS, DNF, DQ }`。
- `Meet`：`id, ownerId(FK cascade), name, meetDate, hostPoolId?(FK SetNull), createdAt`。`@@index([ownerId])`。
- `RaceEvent`：`id, meetId(FK cascade), distanceMeters, stroke, order, createdAt`。`@@index([meetId])`。
- `MeetEntry`：`id, raceEventId(FK cascade), swimmerId(FK), seedTimeMs?, resultTimeMs?, resultStatus(default ENTERED), createdAt`。`@@unique([raceEventId, swimmerId])`、`@@index([raceEventId])`。成绩**内联在报名**上（E1 不单列 Result 表）。

**名次与奖牌（纯函数 + 服务，重点测试）**
- 年龄组（代码配置 `AGE_GROUPS`，按**赛事日期**计实岁）：`6至8岁 / 9至14岁 / 15至18岁 / 19至35岁 / 36至45岁 / 46至55岁 / 56至69岁 / 70岁以上`。`ageGroupOf(birthDate, meetDate)`。
- `standings(entries, meetDate)`：按 `(gender, 年龄组)` 分组；组内 `resultStatus===OK && resultTimeMs!=null` 的按 `resultTimeMs` 升序 → 名次（**并列同名次**，下一名次跳号）；每组前三 `medal = gold/silver/bronze`；DNS/DNF/DQ 与无成绩者单列“未计名次”。

**API（owner，`@Roles(OWNER)`）**
- `POST /meets`（Pro 门禁）、`GET /meets`、`GET /meets/:id`（含项目）、`DELETE /meets/:id`
- `POST /meets/:id/events`（距离+泳姿）、`DELETE /events/:eid`
- `POST /events/:eid/entries`（swimmerId + seedTime?；校验会员属本 owner 且有 gender/birthDate）、`GET /events/:eid/entries`、`DELETE /entries/:enid`
- `PATCH /entries/:enid/result`（resultTimeMs? + resultStatus）
- `GET /events/:eid/standings`（按组名次 + 奖牌）
- 会员人口学：扩展 `POST /pools/:id/swimmers`（建会员可带 gender/birthDate）+ `PATCH /pools/:id/swimmers/:sid`（可改 gender/birthDate）
- 所有权：赛事/项目/报名均校验链路属本 owner（`assertOwnsMeet` 等）。

**前端（owner 控制台）**
- **顶层「赛事」菜单**（侧栏）+ 路由 `/meets`、`/meets/:id`。
- `MeetsListPage`：列表 + 新建赛事（名称/日期/主办泳池）。
- `MeetDetailPage`：项目列表（加项目：距离+泳姿）；选中项目 →（a）报名（从名册选会员 + 种子成绩）（b）录成绩（mm:ss.SS + 状态）（c）**排行榜**（按 性别/年龄组 分组卡片 + 金银铜）。
- 名册「新建/编辑会员」加 性别 + 出生日期。
- 别处 402（Free 建赛）由全局错误提示弹出。

**shared 类型**：`Gender/Stroke/ResultStatus`、`MeetSummary/MeetDetail/RaceEventItem/EntryItem/StandingsGroup/StandingRow`、`CreateMeetDto/CreateRaceEventDto/CreateEntryDto/SetResultDto`，`SwimmerListItem`/`CreateSwimmerDto` 加 gender/birthDate。

## 默认值（设计已批）

- 报名范围：owner 名下**任意泳池**会员（俱乐部赛）；赛事 `hostPool` 仅作场地。
- 成绩：存毫秒整数；录入/显示 `mm:ss.SS`（`parseSwimTime`/`formatSwimTime` 助手）。
- 计划门禁：创建赛事为 **Pro 功能**（`billing.assertFeature('meets')`）。
- 泳姿：自由泳/仰泳/蛙泳/蝶泳/个人混合。

## 行为契约

- 报名会员缺 gender/birthDate → `422`。报名非本 owner 会员 → `404/403`。
- 建赛 Free → `402`。
- standings 仅 `OK` 计名次；并列同名次；每（性别×年龄组）独立金银铜。

## 测试

- 单测：`ageGroupOf`（边界年龄）、`parseSwimTime/formatSwimTime`、`standings`（分组/并列/奖牌/排除非 OK/空组）；MeetsService（建赛 Pro 门禁、加项目、报名校验人口学、录成绩、standings 组装、所有权）。
- e2e：建赛→加项目→给会员设性别/生日→报名→录成绩→`GET standings` 按组名次+奖牌；Free 建赛 402；报名缺人口学 422；DNS 不计名次。
- web：MeetDetail 报名+录成绩流；排行榜分组渲染；名册人口学字段。

## 非目标（E1）

分组泳道编排(E2)、公开赛事页(E3)、自助/公开报名(E4)、纪录/积分榜(E5)、接力、DQ 原因码、按种子成绩排道、成绩封榜/锁定。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增「赛事」段 + 端点；自评审；合并 main。
