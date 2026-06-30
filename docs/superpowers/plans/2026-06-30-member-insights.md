# 会员洞察 实现计划（TDD）

> spec：`docs/superpowers/specs/2026-06-30-member-insights-design.md`。分支 `feat/member-insights`。无迁移。

## Global Constraints
- shared 改后 `npm run build -w @swim/shared`。
- 年龄组按**当前日期**计龄；前端从 `birthDate` 经 `@swim/shared` 的 `ageGroupOf` 统一计算。
- 提交尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## Task 1 — shared：提升年龄组 + LeaderboardRow 富化
- `packages/shared/src/index.ts`：加 `AgeBand`、`AGE_GROUPS`、`ageAt`、`ageGroupOf`（从 api `meets/age-group.ts` 原样搬运）。`LeaderboardRow` += `gender: Gender|null; birthDate: string|null; sessionCount: number; status: RegistrationStatus;`。
- `apps/api/src/meets/age-group.ts` 改为 `export { AgeBand, AGE_GROUPS, ageAt, ageGroupOf } from '@swim/shared';`。
- build shared；跑 api 单测确认 standings/records/age-group 仍绿（导入未变）。提交。

## Task 2 — 后端 leaderboardOf 富化（红→绿）
- `ChallengesService.leaderboardOf` SQL：SELECT 加 `u."gender"`, `u."birthDate"`, `COUNT(s.*)::int AS "sessionCount"`, `r."status"`；`LEFT JOIN "Registration" r ON r."swimmerId"=s."swimmerId" AND r."poolId"=${poolId}`；GROUP BY 加 `u.gender,u."birthDate",r.status`。映射进 `LeaderboardRow`（birthDate→ISO；status 缺省 'INACTIVE'? 实际有 registration 必有；无则 'ACTIVE' 兜底）。
- `challenges.service.spec`：leaderboardOf mock $queryRaw 返回含 gender/birthDate/sessionCount/status → 断言映射。提交。

## Task 3 — 后端名册筛选（红→绿）
- `apps/api/src/common/pagination.ts` 或就地：`PoolsService.listSwimmers` 增参 `filter?: { gender?; status?; q? }`；`where` 组装（status、swimmer.gender、OR name/email contains insensitive）；list+count 同 where。
- 控制器 `swimmers()` 读 `@Query('gender') / @Query('status') / @Query('q')` 传入。
- `pools.service.spec`：传 gender/status/q → 断言 where 传参（findMany & count）。e2e `owner-flows`：建会员（含/不含 gender）→ `?gender=MALE`/`?status=INACTIVE`/`?q=` 命中过滤。提交。

## Task 4 — 前端 `/swimmers/:sid` 只读泳迹图页
- Create `apps/web/src/features/swimmers/SwimmerStatsPage.tsx`（复用 `useSwimmerStats(sid)` + `HeatmapCard` + 3 个 Statistic；无代录）。router 加 `/swimmers/:sid`（ProtectedRoute 内、AppLayout 内）。
- Test：mock `/api/stats/swimmer/s1` → 渲染热力图 + 总里程。提交。

## Task 5 — 前端 挑战排行榜 列/筛选/按钮（红→绿）
- `ChallengeDetailPage`：列 名次/姓名/性别/年龄组/状态/游泳次数/里程/里程占比/邮箱 +「泳迹图」按钮(`navigate('/swimmers/'+r.swimmerId)`，stopPropagation 无需-无行点击)。里程占比 = `Math.round(d/总*100)%`（总=leaderboard 里程和）。年龄组 `ageGroupOf(new Date(birthDate), new Date())`，无 birthDate→'—'。
- 顶部筛选：性别 Select(全部/男/女)、年龄组 Select(全部 + AGE_GROUPS)、状态 Select、姓名/邮箱 Input；`useMemo` 客户端过滤 leaderboard。
- Test：渲染性别/年龄组/次数列；按性别筛选后只剩匹配行；点泳迹图按钮跳转。提交。

## Task 6 — 前端 泳池名册 列/服务端筛选/按钮（红→绿）
- `endpoints.listSwimmers(poolId,page,filter?)` + `useSwimmers(poolId,page,filter?)` 传 `{gender,status,q}` 进 params；queryKey 含 filter。
- `RosterTable`：筛选条（性别/状态 Select + 搜索 Input，改动回到 page 1）；列加 性别 + 年龄组；操作列加「泳迹图」按钮(跳 `/swimmers/:sid`)。
- Test：选性别 → 请求带 `gender=`；渲染年龄组列。提交。

## Task 7 — 前端 赛事报名席 列/按钮（红→绿）
- `MeetDetailPage` 报名与成绩 List/区：每条加 年龄组 + 「泳迹图」按钮（性别已显示）；可选性别/年龄组客户端筛选（轻量：性别 Select）。
- Test：报名席显示年龄组 + 泳迹图按钮跳转。提交。

## Task 8 — 终验
- 全量门禁（lint/build/test/e2e）；README 增「会员洞察」段；自评审（IDOR：/stats/swimmer/:sid 所有权；筛选注入：Prisma 参数化）；合并 main + 推送 + 删分支；通知。
