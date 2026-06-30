# 会员洞察：信息列 + 筛选 + 个人泳迹图

> canonical：本 spec。给 owner 控制台的会员表加 人口学/状态/训练 信息列、筛选、以及逐行「个人泳迹图」入口。覆盖三张表：挑战排行榜 / 泳池名册 / 赛事报名席。

## 目标

owner 在会员列表里一眼看到 **性别 / 年龄组 / 状态 /（挑战榜额外：游泳次数、里程占比）**，可**筛选**，并能点**「个人泳迹图」**查看该会员训练热力图。

## 列适配矩阵（按表量体裁衣）

| 列 | 挑战排行榜 | 泳池名册 | 赛事报名席 |
|---|---|---|---|
| 性别 | ✓ | ✓ | ✓ |
| 年龄组 | ✓ | ✓ | ✓ |
| 会员状态(活跃/停用) | ✓ | ✓(已有) | ✗（用成绩状态，不混训练状态） |
| 游泳次数(窗口内) | ✓ | ✗ | ✗ |
| 里程占比 | ✓ | ✗ | ✗ |
| 个人泳迹图 | ✓ | ✓ | ✓ |
| 筛选 | ✓ 客户端 | ✓ 服务端 | ✓ 客户端 |

> 训练指标（次数/占比）只上挑战排行榜（它本就是窗口里程榜）；其余三表通用。**年龄组按当前日期计龄**（会员信息视角，非比赛分龄）。

## shared

- 把年龄组提升到 `@swim/shared`：`AgeBand`、`AGE_GROUPS`、`ageAt(birthDate,on)`、`ageGroupOf(birthDate,on)`（纯函数，无 node 依赖）。api 现有 `meets/age-group.ts` 改为 `export { ... } from '@swim/shared'`（行为不变，standings/records/meets 的导入不动）。前端三表统一用它从 `birthDate` 算年龄组。
- `LeaderboardRow` += `gender: Gender | null`、`birthDate: string | null`、`sessionCount: number`、`status: RegistrationStatus`。（`里程占比` 前端按 该会员里程÷窗口总里程 算，不落后端。年龄组前端按 birthDate 算。）

## 后端

- `ChallengesService.leaderboardOf` 的原始 SQL：增 `u.gender`、`u."birthDate"`、`COUNT(s.*)` 作 `sessionCount`、`LEFT JOIN "Registration" r ON r."swimmerId"=s."swimmerId" AND r."poolId"=<pool>` 取 `r.status`；映射进 `LeaderboardRow`。
- `PoolsService.listSwimmers` + 控制器：加可选筛选 `gender? / status? / q?`（`GET /pools/:id/swimmers?gender=&status=&q=`）。`where` = `{ poolId, status?, swimmer:{ gender?, OR:[name contains q, email contains q]（insensitive）} }`，list 与 count 同 where。（名册投影已含 gender/birthDate，无需加列。）
- 复用既有 `GET /stats/swimmer/:sid`（已做 owner 所有权校验）支撑泳迹图页——不新增后端。

## 前端（web）

- **个人泳迹图统一入口**：新增只读路由 `/swimmers/:sid`（`SwimmerStatsPage`，复用 `useSwimmerStats` + `HeatmapCard` + 总里程/次数/时长 Statistic，无「代录」）。三表「泳迹图」按钮都跳此（不依赖 poolId，赛事报名席也能用）。
- **挑战排行榜（ChallengeDetailPage）**：列 = 名次/姓名/性别/年龄组/状态/游泳次数/里程/里程占比/邮箱 +「泳迹图」按钮；顶部筛选条（性别、年龄组、状态 Select + 姓名/邮箱搜索 Input）客户端过滤。
- **泳池名册（RosterTable）**：升列 性别/年龄组（状态已有）+「泳迹图」按钮；筛选条走服务端参数（`useSwimmers(poolId,page,{gender,status,q})`，切筛选回到第 1 页）。
- **赛事报名席（MeetDetailPage 报名与成绩）**：性别升为列 + 年龄组列 +「泳迹图」按钮（训练列不加）；客户端筛选（性别/年龄组）。
- `GENDER_LABEL`/年龄组展示复用；`ageGroupOf` from `@swim/shared`。

## 测试

- shared：`ageGroupOf` 边界单测（沿用 api 既有用例迁移/保留）。
- 后端：`leaderboardOf` 返回 gender/sessionCount/status（单测）；名册筛选 `gender/status/q` 命中（service 单测 + e2e）。
- 前端：挑战排行榜渲染新列 + 客户端筛选 + 泳迹图按钮跳 `/swimmers/:sid`；名册服务端筛选触发请求带参；`/swimmers/:sid` 渲染热力图；赛事报名席年龄组列。

## 非目标

赛事报名席的训练指标列；游泳者端（移动端）会员表；导出筛选结果；自定义列。

## 验收门

四工作区 lint/build/test/e2e 全绿（无迁移——仅查询/投影/前端）；README 增「会员洞察」段；自评审；合并 main + 推送 + 删分支。
