# 赛事平台 E2：分组泳道（heats & lanes 排道 + 出发名单）

> 承接 E1。canonical：本 spec。把报名按种子成绩冠军式编排到分组与泳道，产出出发名单。E3-E5 仍在后面。

## 目标

owner 对某比赛项目一键「排道」：按种子成绩 `seedTimeMs` 把报名者**冠军式**编排到**分组(heats)**与**泳道(lanes)**，前端按 heat 渲染**出发名单**。

## 排道算法（纯函数，重点测试）

`seedHeats(entries, laneCount) → { id, heat, lane }[]`：
- 排序：有种子成绩者从快到慢；**无种子成绩者视为最慢**（稳定，按报名序）。
- `heatCount = ⌈N / laneCount⌉`；把排序后的人切成 `laneCount` 大小的块：**chunk[0]（最快）→ 最后一组**，chunk[c] → heat `heatCount - c`，最慢的余数块 → heat 1（可不满）。
- 组内泳道**中心向外**：`lanePriority(L)` —— 6 道 `[3,4,2,5,1,6]`、8 道 `[4,5,3,6,2,7,1,8]`；组内最快占中心道。

`lanePriority(L)`：`mid=⌈L/2⌉`，序列 `mid, mid+1, mid-1, mid+2, mid-2, …`（裁剪到 1..L）。

**整项目按时间混合编排**（计时决赛常规）；成绩名次仍按 E1 的 性别×年龄组 拆。

## 数据

- `Meet` 加 `laneCount Int @default(6)`（场地泳道数）。
- `MeetEntry` 加 `heat Int?` + `lane Int?`。一条迁移。
- 「排道」对整项目重算并覆盖所有报名的 heat/lane。

## API

- `POST /events/:eid/seed`（`@Roles(OWNER)`，所有权校验）→ 取该项目所有报名 + 赛事 laneCount → `seedHeats` → 事务更新各报名 heat/lane → 返回 `EntryItem[]`（含 heat/lane）。
- `GET /events/:eid/entries`、`PATCH /entries/:enid/result` 等返回的 `EntryItem` 现含 `heat/lane`。
- 赛事创建/编辑接受 `laneCount`。

## shared

- `EntryItem` 加 `heat: number | null; lane: number | null;`
- `MeetSummary` 加 `laneCount: number;`（`MeetDetail` 继承）
- `CreateMeetDto` 加 `laneCount?: number;`

## 前端（owner 控制台）

- 新建赛事表单加「泳道数」（默认 6）。
- 赛事详情项目面板加「**排道**」按钮（调 seed）+「**出发名单**」卡：按 heat 分组（标题「第 N 组」），组内按**泳道升序**列出 道次 / 姓名 / 种子成绩。

## 默认值（设计已批）

- 泳道数：记在**赛事**上，默认 6。
- 编排粒度：整项目**按时间混合**。

## 测试

- 单测：`lanePriority`（6/8 道序列）；`seedHeats`（最快进末组、中心向外、无种子排最后、整除/余数、单组、空）。`MeetsService.seedEvent`（取 laneCount、事务更新、返回含 heat/lane）。
- e2e：建赛(laneCount=6)→项目→报 8 人(带种子成绩)→`POST seed`→断言最快者在末组中心道、第 7/8 名在 heat 1。
- web：出发名单按 heat 分组渲染。

## 非目标（E2）

临场/检录改道、开赛后退赛重排、接力排道、多单元(session)、道次偏好。E3 公开页 / E4 公开报名 / E5 纪录积分仍在后面。

## 验收门

lint/build/test/e2e 全绿；README 增分组泳道；自评审；合并 main。
