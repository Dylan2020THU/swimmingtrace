# 赛事 E5 纪录与积分榜 实现计划（TDD）

> 用 superpowers:executing-plans 逐任务实现；步骤用 `- [ ]`。spec：`docs/superpowers/specs/2026-06-30-meets-e5-records-points-design.md`。分支 `feat/meets-e5-records-points`。

**Goal：** 赛事平台收官——赛会纪录 + PB 与跨赛事赛季积分榜，三端（owner/public/swimmer）。

**Architecture：** 纪录/积分全部读时派生（复用 `computeStandings`），唯一新增持久化 `Season`(+`Meet.seasonId`)。新纯函数 `points.ts`/`records.ts`，重点单测。

## Global Constraints

- shared 改动后 `npm run build -w @swim/shared`（ts-jest 类型解析走 dist）。
- prisma generate 遇 Windows EPERM 先 `Get-Process node | Stop-Process -Force`。
- 迁移：手写时间戳 SQL 目录 + `prisma migrate deploy`（swim + e2e swim_test 全局 setup 自动应用）。
- 建赛季 Pro 门禁：`billing.assertFeature(ownerId,'meets')`（复用现有 feature key）。
- 公开端点无鉴权但 PII 安全投影：绝不含邮箱/出生日期/ownerId；未发布 `404`。
- 提交信息尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## Task 1 — shared 类型 + Prisma Season 模型 + 迁移

**Files:** Modify `packages/shared/src/index.ts`；`apps/api/prisma/schema.prisma`；Create `apps/api/prisma/migrations/20260630060000_season/migration.sql`。

- [ ] shared 增：
  ```ts
  export interface CreateSeasonDto { name: string; referenceDate: string; }
  export interface SetSeasonPublishedDto { published: boolean; }
  export interface AssignSeasonDto { seasonId: string | null; }
  export interface SeasonSummary { id: string; name: string; referenceDate: string; published: boolean; meetCount: number; createdAt: string; }
  export interface SeasonStandingRow { rank: number | null; swimmerId: string; name: string | null; points: number; }
  export interface SeasonStandingsGroup { gender: Gender; ageGroup: string; rows: SeasonStandingRow[]; }
  export interface SeasonDetail extends SeasonSummary { meets: Array<{ id: string; name: string; meetDate: string }>; standings: SeasonStandingsGroup[]; }
  export interface RecordRow { distanceMeters: number; stroke: Stroke; gender: Gender; ageGroup: string; swimmerId: string; name: string | null; timeMs: number; meetName: string; meetDate: string; }
  export interface PbRow { distanceMeters: number; stroke: Stroke; timeMs: number; meetName: string; meetDate: string; isClubRecord: boolean; }
  export interface PublicSeason { id: string; name: string; standings: SeasonStandingsGroup[]; }
  ```
  且 `MeetSummary` += `seasonId: string | null; seasonName: string | null;`（同步 E1 MeetSummary 投影 3 处补 seasonId/seasonName）。`npm run build -w @swim/shared`。
- [ ] schema：`Meet` += `seasonId String?`、`season Season? @relation(fields:[seasonId],references:[id],onDelete:SetNull)`；`User` += `seasons Season[] @relation("SeasonOwner")`；新增 `Season` model（见 spec）。
- [ ] 迁移 SQL：建 `Season` 表 + `Meet.seasonId` 列 + FK(SetNull) + 索引。kill node → `prisma generate` → `prisma migrate deploy`（swim）。

## Task 2 — 纯函数 points.ts（红→绿）

**Files:** Create `apps/api/src/meets/points.ts`、`apps/api/src/meets/points.spec.ts`。

**Produces:**
```ts
export function pointsForRank(rank: number | null): number;
export interface SeasonEvent { entries: StandingEntry[] }   // StandingEntry from ./standings
export function seasonPoints(events: SeasonEvent[], referenceDate: Date): SeasonStandingsGroup[];
```

- [ ] 写测试 `points.spec.ts`：
  - `pointsForRank`：1→9,2→7,3→6,4→5,5→4,6→3,7→2,8→1,9→0,null→0。
  - `seasonPoints`：两 event、同一 swimmer 跨 event 累加；按 性别×年龄组 分组（计龄用 referenceDate，验证跨 event 同组）；组内按总分降序、同分并列 rank；DNS/DNF/DQ/未上榜得 0。
- [ ] 跑测试见失败。
- [ ] 实现：`seasonPoints` 对每 event `computeStandings(e.entries, referenceDate)`→遍历组内 rows，`pointsForRank(row.rank)` 累加到 `Map<\`${gender}__${ageGroup}\`, Map<swimmerId,{name,points}>>`；输出每组 rows 按 points 降序、并列同 rank（次名跳号），组按 `GENDER_ORDER` × `AGE_GROUPS` 序（参照 standings.ts）。
- [ ] 跑测试全绿 → 提交。

## Task 3 — 纯函数 records.ts（红→绿）

**Files:** Create `apps/api/src/meets/records.ts`、`apps/api/src/meets/records.spec.ts`。

**Produces:**
```ts
export interface RecordEntry {
  ownerId: string; swimmerId: string; name: string | null;
  gender: Gender | null; birthDate: Date | null;
  distanceMeters: number; stroke: Stroke;
  resultTimeMs: number | null; resultStatus: ResultStatus;
  meetName: string; meetDate: Date;
}
export function clubRecords(entries: RecordEntry[]): RecordRow[];     // 键 (ownerId,distance,stroke,gender,ageGroupOf(birthDate,meetDate))；RecordRow 不含 ownerId
export function personalBests(entries: RecordEntry[], records: RecordRow[]): PbRow[]; // 单泳者 entries：每 (distance,stroke) 最快 OK；isClubRecord = records 有同 distance+stroke+swimmerId+timeMs
```

- [ ] 写测试：
  - `clubRecords`：仅 `OK` 计入；同格取最快；不同 性别/年龄组/项目 各一条；排除 DNS/DNF/DQ 与缺 gender/birthDate；年龄组按各 entry 的 meetDate 计。
  - `personalBests`：每项目取该泳者最快；`isClubRecord` 命中（其 PB 即纪录保持成绩）/未命中两例。
- [ ] 跑测试见失败。
- [ ] 实现两函数（min 归并；`ageGroupOf` from `./age-group`）。
- [ ] 跑测试全绿 → 提交。

## Task 4 — SeasonsService + owner/swimmer 端点 + MeetsService 接线（红→绿）

**Files:** Create `apps/api/src/seasons/seasons.service.ts`、`seasons.controller.ts`、`seasons.module.ts`、`seasons.service.spec.ts`；Modify `apps/api/src/meets/meets.service.ts`（createMeet/listMeets/meetDetail 补 seasonId/seasonName + `setMeetSeason`）、`meets.controller.ts`（`POST /meets/:id/season`）、`apps/api/src/me/me.controller.ts`+`me.service.ts`（`GET /me/records`）、`apps/api/src/app.module.ts`（注册 SeasonsModule）。

**Interfaces (Produces):** `SeasonsService`：
```ts
createSeason(ownerId, dto: CreateSeasonDto): Promise<SeasonSummary>      // assertFeature('meets')
listSeasons(ownerId): Promise<SeasonSummary[]>
seasonDetail(ownerId, id): Promise<SeasonDetail>                          // 含 meets + seasonPoints(events, referenceDate)
deleteSeason(ownerId, id): Promise<{ok:true}>
setSeasonPublished(ownerId, id, published): Promise<{published:boolean}>
clubRecordsOf(ownerId): Promise<RecordRow[]>                             // clubRecords(该 owner 全部 entries)
ownSeason(ownerId, id)  // guard：不存在 404 / 非本人 403
```
`MeetsService.setMeetSeason(ownerId, meetId, seasonId|null)`（校验 season 同 owner，否则 404）。`MeService.myRecords(swimmerId): Promise<PbRow[]>`（取该泳者 OK entries + 涉及 owner 的 clubRecords → personalBests）。

- [ ] 写 `seasons.service.spec.ts`：createSeason Pro 门禁 + 落库；ownSeason 非本人 403；seasonDetail 累计积分（mock prisma 返回两赛事 entries）；setMeetSeason 跨 owner season → 404；clubRecordsOf 取最快。me.service.spec：myRecords 计 PB + isClubRecord。meets.service.spec：createMeet 返回含 `seasonId:null,seasonName:null`。
- [ ] 跑见失败。
- [ ] 实现 service + controllers（owner `@Roles(OWNER)`：`POST/GET /seasons`、`GET/DELETE /seasons/:id`、`POST /seasons/:id/publish`、`GET /records`、`POST /meets/:id/season`；swimmer `@Roles(SWIMMER)`：`GET /me/records`）；DTO body 类（class-validator：`@IsString name`、`@IsDateString referenceDate`、`@IsBoolean published`、`@IsOptional @IsUUID seasonId`）。meets 3 投影补 seasonId/seasonName（`season:{select:{name:true}}` include）。注册 SeasonsModule（imports BillingModule，providers PrismaService）。
- [ ] 跑 api 单测全绿 → 提交。

## Task 5 — public 端点（红→绿）

**Files:** Create `apps/api/src/seasons/public-seasons.controller.ts`；Modify `seasons.module.ts`（注册）、`seasons.service.ts`（`publicSeason(id)`、`publicSeasonRecords(id)`）。

**Produces:** `publicSeason(id): Promise<PublicSeason>`（未 `published`→404；投影仅 name+standings）、`publicSeasonRecords(id): Promise<RecordRow[]>`（该 season 的 owner 纪录板；未发布→404）。Controller `@Controller('public')` 无 guard：`GET /public/seasons/:id`、`GET /public/seasons/:id/records`。

- [ ] 写单测：未发布→`NotFoundException`；已发布投影 `JSON.stringify` 不含 `@`。
- [ ] 跑见失败 → 实现（复用 seasonDetail 的 standings 计算；records 复用 clubRecordsOf）→ 跑绿 → 提交。

## Task 6 — e2e

**Files:** Create `apps/api/test/meets-records-points.e2e-spec.ts`（beforeAll 清库顺序补 `season`：meetEntry→raceEvent→meet→season→apiKey→idempotencyKey→challenge→swimSession→registration→pool→user）。

- [ ] 串联：owner(PRO) 建池+两会员(含 gender/birthDate)→建赛季(referenceDate)→建两赛事归入赛季(`POST /meets/:id/season`)→各加 50自 项目+报名+录成绩→`GET /seasons/:id` 积分累计正确(两场分相加)→`GET /records` 纪录正确→swimmer 认领→`GET /me/records` 见 PB(+isClubRecord)→`POST /seasons/:id/publish`→`GET /public/seasons/:id`(+/records) 200 且 `JSON.stringify` 无 `@`→未发布前/再取消后 `404`。
- [ ] 跑 e2e 全绿 → 提交。

## Task 7 — web owner 前端（赛季管理 + 积分榜 + 纪录板 + 归入赛季）

**Files:** Modify `apps/web/src/lib/api/endpoints.ts`、`lib/queries.ts`、`features/meets/MeetDetailPage.tsx`、`app/router.tsx`、`components/AppLayout.tsx`（「赛季」「纪录」入口）；Create `features/seasons/SeasonsListPage.tsx`、`SeasonDetailPage.tsx`、`features/records/RecordsPage.tsx` + 各 `.test.tsx`。

- [ ] endpoints/queries：`createSeason/listSeasons/getSeason/deleteSeason/publishSeason/setMeetSeason/getRecords`。
- [ ] SeasonsListPage：列表 + 新建(name+referenceDate DatePicker) + 删除；SeasonDetailPage：赛季信息 + 公开开关 + 复制 `/p/seasons/:id` + 积分榜(按 性别×年龄组 Table，分值/名次)。RecordsPage：纪录板 Table（项目/性别/年龄组/保持人/成绩/赛事）。
- [ ] MeetDetailPage：加「归入赛季」Select（选项来自 listSeasons；onChange→setMeetSeason；显示当前 seasonName）。
- [ ] AppLayout 顶层菜单 += 「赛季」「纪录」；router 加 `/seasons`、`/seasons/:id`、`/records`。
- [ ] 测试：SeasonDetail 积分榜渲染 + 公开开关 POST；RecordsPage 渲染；MeetDetail 归入赛季触发 POST。`formatSwimTime` 复用 `lib/swim-time`。
- [ ] 跑 web 单测全绿 → 提交。

## Task 8 — public 赛季页

**Files:** Modify `apps/web/src/lib/api/endpoints.ts`（`getPublicSeason/getPublicSeasonRecords`）、`lib/queries.ts`、`app/router.tsx`（`/p/seasons/:id`，ProtectedRoute 外）；Create `features/seasons/SeasonPublicPage.tsx` + `.test.tsx`。

- [ ] SeasonPublicPage：积分榜 + 纪录板（只读、无 owner 操作）；未发布(404)→友好「赛季未公开」。
- [ ] 测试：渲染积分榜 + 纪录；404 兜底。
- [ ] 跑 web 单测全绿 → 提交。

## Task 9 — swimmer「我的成绩」(PB) 页

**Files:** Modify `apps/swimmer/src/lib/api/endpoints.ts`（`getMyRecords`）、`lib/queries.ts`（`useMyRecords`）、`features/profile/ProfilePage.tsx`（入口「我的成绩」）、`app/router.tsx`（`/records`）；Create `features/records/MyRecordsPage.tsx` + `.test.tsx`。

- [ ] MyRecordsPage：PB 列表（项目 + `formatSwimTime` + `🏆` if isClubRecord）；空态。`lib/swim-time` 已含 format。
- [ ] 测试：渲染 PB；isClubRecord 显示徽标。
- [ ] 跑 swimmer 单测全绿 → 提交。

## Task 10 — 终验

- [ ] 全量门禁：`npm run lint`、`npm run build`、`npm test`（api+web+swimmer）、`npm run test:e2e` 全绿。
- [ ] README：增「E5 纪录与积分榜」段（含计龄基准两标准说明）+ 接口表补 seasons/records/public/me 行；更新收官说明（赛事平台 E1-E5 完成）。
- [ ] 自评审（对抗式）：PII 投影、所有权、Pro 门禁、计龄基准一致性。
- [ ] 合并 main(`--no-ff`) + 推送 + 删分支；通知验收。
