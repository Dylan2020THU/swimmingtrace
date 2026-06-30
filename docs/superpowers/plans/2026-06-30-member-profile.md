# 会员个人主页 实现计划（TDD）

> spec：`docs/superpowers/specs/2026-06-30-member-profile-design.md`。分支 `feat/member-profile`。无迁移。

## Global Constraints
- shared 改后 `npm run build -w @swim/shared`（web 经 vite alias 读 src，api 经 dist）。
- 端点 owner-only + `assertOwnsSwimmer`；只查 owner 名下泳池。
- 提交尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## Task 1 — shared 类型
- `packages/shared/src/index.ts`：加 `MemberProfile`、`MemberSessionRow`（见 spec）。build shared。提交。

## Task 2 — 后端 service/端点（红→绿）
- `StatsService.swimmerStats(ownerId, swimmerId, year?)`：heatmap 用 `year ?? 今年`；summary 不变。
- `StatsService.memberProfile(ownerId, sid): Promise<MemberProfile>`：`assertOwnsSwimmer`；`user.findUnique`（name/email/gender/birthDate/claimedAt/createdAt）；`registration.findMany({ where:{ swimmerId:sid, pool:{ ownerId } }, include:{ pool:{ select:{ name:true } } }, orderBy:{ joinedAt:'desc' } })` → pools[]。
- `StatsService.memberSessions(ownerId, sid, year?, page?, pageSize?): Promise<Paginated<MemberSessionRow>>`：`assertOwnsSwimmer`；`where = { swimmerId:sid, pool:{ ownerId }, swamAt:{ gte:YYYY-01-01, lt:(YYYY+1)-01-01 } }`（year 缺省今年）；`findMany({ where, include:{ pool:{select:{name}} }, orderBy:{ swamAt:'desc' }, skip, take })` + `count` → 映射 poolName。
- `StatsController`：`swimmer/:sid` 加 `@Query('year')`；新增 `@Get('swimmer/:sid/profile')`、`@Get('swimmer/:sid/sessions')`（`@Query() PaginationQuery` + `@Query('year')`），均 `@Roles(OWNER)`。
- 单测 `stats.service.spec.ts`：swimmerStats(year) 调 dailyDistance 用对年份（断言 $queryRaw 调用/heatmap）；memberProfile（mock user+registration → pools 投影；非所有者 registration.findFirst→null → 403）；memberSessions（findMany 倒序+skip/take、poolName 映射、count→total；403）。跑 api 单测绿。提交。

## Task 3 — 后端 e2e
- `apps/api/test/owner-flows.e2e-spec.ts` 增：owner 建池+会员+代录两条（不同日期）→ `GET /stats/swimmer/:sid/profile` 含 name/pools；`GET /stats/swimmer/:sid/sessions` 倒序 + poolName + `{items,total,page,pageSize}`；跨 owner 访问 → 403。跑 e2e 绿。提交。

## Task 4 — 前端（红→绿）
- `endpoints.ts`：`getSwimmerStats(sid, year?)`（加 year param）；`getMemberProfile(sid)`；`getMemberSessions(sid, year, page, pageSize)`。
- `queries.ts`：`useSwimmerStats(sid, year)`（queryKey 含 year）；`useMemberProfile(sid)`；`useMemberSessions(sid, year)` 用 `useInfiniteQuery`（getNextPageParam: last.page*pageSize<total ? last.page+1 : undefined）。
- `features/swimmers/SwimmerProfileCard.tsx`（新）：`Avatar`(首字母) + 姓名/邮箱 + 性别/年龄组 Tag + `Descriptions`（性别/年龄组/认领状态/注册时间）+ 泳池 `List`（名+状态 Tag+加入日期）。
- `features/swimmers/MemberSessionList.tsx`（新）：扁平化 infinite pages → 按 `dayjs(swamAt).format('YYYY-MM')` 分组倒序；每月 `Divider`/标题「YYYY年M月 · N 次 · D 米」+ `List`（日期 · 泳池 · 距离米 · 时长）；底「加载更多」(hasNextPage)。
- `SwimmerStatsPage.tsx` 重构：`Row`（左 `Col` ProfileCard；右 `Col` 概览 Statistic + 热力图 Card（含年份 `Select`，选项 createdAt 年→今年）+ MemberSessionList）。年份 state 驱动 useSwimmerStats(year) + useMemberSessions(year)。
- 测试 `SwimmerStatsPage.test.tsx` 重写：msw 补 `/api/stats/swimmer/s1/profile`、`/sessions`；断言 姓名/性别/年龄组/泳池名 + 概览 + 明细某条 + 切年份请求带 year；`msw.ts` 默认补两 handler。跑 web 单测绿。提交。

## Task 5 — 终验
- 全量门禁（lint/build/test/e2e 四区）；Ultracode 对抗式评审 workflow（IDOR/PII/分页/年份边界）→ 修;README 增「会员主页」；合并 main + 推送 + 删分支；通知。
