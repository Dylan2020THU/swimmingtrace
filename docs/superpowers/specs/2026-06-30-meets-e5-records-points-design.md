# 赛事平台 E5：纪录与积分榜

> 承接 E1-E4，赛事平台收官片。canonical：本 spec。一次交付完整「成绩荣誉」面：**赛会纪录 + 个人最好成绩（PB）** 与 **跨赛事赛季积分榜**。三端（owner / public / swimmer）。

## 目标

- **纪录**：俱乐部历史每项目最快（赛会纪录，按 性别×年龄组）；每人每项目自身最快（PB），PB 标注是否即当前赛会纪录。
- **积分**：赛事归入「赛季/系列赛」，按各项目 性别×年龄组 组内名次给分（固定 FINA 式表），跨场累计为赛季积分榜。

## 架构取向

纪录/积分**全部读时派生**——由 `MeetEntry` 成绩 + 现有 `computeStandings` 纯函数算出，**不落聚合表**。唯一新增持久化是 `Season`（+ `Meet.seasonId`）。派生式与平台现有「standings 即时计算」一致，纯函数为主、易重点单测。否决「物化 points/records 表 + 录成绩增量更新」（club 量级下过度设计 + staleness 风险）。

## 数据（唯一迁移）

```prisma
model Season {
  id            String   @id @default(uuid())
  ownerId       String
  owner         User     @relation("SeasonOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  name          String
  referenceDate DateTime              // 赛季年龄基准日（积分榜统一计龄）
  published     Boolean  @default(false)
  meets         Meet[]
  createdAt     DateTime @default(now())
  @@index([ownerId])
}
// Meet += seasonId String?  season Season? @relation(fields:[seasonId], references:[id], onDelete: SetNull)
// User += seasons Season[] @relation("SeasonOwner")
```

其余（纪录/积分/PB）无表，纯派生。

## 纯函数（apps/api/src/meets/）

- `points.ts`：`pointsForRank(rank: number | null): number` —— 表 `1→9,2→7,3→6,4→5,5→4,6→3,7→2,8→1, ≥9 或 null→0`。
- `points.ts`：`seasonPoints(events: Array<{ entries: StandingEntry[] }>, referenceDate: Date): SeasonStandingsGroup[]` —— 每项目对 `computeStandings(entries, referenceDate)` 取名次→`pointsForRank`→按 swimmer 累加，按 性别×年龄组 分组、组内总分降序（同分并列 rank）。
- `records.ts`：`clubRecords(entries: RecordEntry[]): RecordRow[]` —— 仅 `OK`，按 `(distanceMeters, stroke, gender, ageGroupOf(birthDate, 该 entry 的 meetDate))` 取最快，列 保持人/成绩/赛事。
- `records.ts`：`personalBests(entries: RecordEntry[]): PbRow[]` —— 每 `(distanceMeters, stroke)` 取该 swimmer 最快 `OK`。

> **计龄基准**：纪录用「赛事当日」年龄组（纪录是当时立的）；积分用「赛季基准日」年龄组（赛季统一计龄、跨场不漂移）。两者均为业内标准，README/spec 写明。

## 后端端点

**owner（`@Roles(OWNER)`）**
- `POST /seasons` `{name, referenceDate}` → 建赛季（**Pro**：`assertFeature('meets')`）。
- `GET /seasons` / `GET /seasons/:id`（含归属赛事 + 积分榜）/ `DELETE /seasons/:id`。
- `POST /seasons/:id/publish` `{published}` → 公开开关。
- `POST /meets/:id/season` `{seasonId: string | null}` → 赛事归入/移出赛季（校验赛季同属本 owner）。
- `GET /records` → 本俱乐部纪录板（`RecordRow[]`）。

> 赛季积分榜由 `GET /seasons/:id`（`SeasonDetail.standings`）一并返回，不另设 `/seasons/:id/standings`。

**swimmer（`@Roles(SWIMMER)`）**
- `GET /me/records` → 我的 PB（`PbRow[]`，标注是否即当前赛会纪录）。

**public（免登录，仅 `published` 赛季，PII 安全投影）**
- `GET /public/seasons/:id` → `PublicSeason`（名 + 积分榜，仅 姓名/性别/年龄组/名次/积分）。
- `GET /public/seasons/:id/records` → 该 owner 纪录板（仅 项目/性别/年龄组/保持人姓名/成绩/赛事名）。
- 经 season id 间接定位 owner，**不暴露** ownerId/邮箱/出生日期；未发布 `404`。

所有 owner 端点过 `ownSeason`/`ownMeet`（非本人 `403`、不存在 `404`）。

## shared 类型

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
// MeetSummary += seasonId: string | null; seasonName: string | null;
```

## 前端

**web owner**：「赛事」区加**赛季**管理（建/列/删 + 公开开关 + 复制公开链接）；赛季详情页含**积分榜**；MeetDetailPage 加「归入赛季」Select；新增**纪录板**页（控制台「赛事」下）。

**public**：`/p/seasons/:id`（ProtectedRoute 外）—— 赛季积分榜 + 纪录板。

**swimmer（antd-mobile）**：「我的」→「**我的成绩**」页：PB 列表（每项目最快 + `🏆` 标注赛会纪录）。

## 安全 / PII

公开投影仅露 姓名/性别/年龄组/成绩/积分/名次；**绝不含**邮箱/出生日期/owner 信息；未发布赛季 `404`（沿用 E3）。单测 + e2e 断言公开响应 `JSON.stringify` 无 `@`。

## 测试

- 纯函数重点单测：`pointsForRank`（边界/≥9/null）、`seasonPoints`（累计/分组/并列/计龄基准）、`clubRecords`（取最快/分桶/排除 DNS·DNF·DQ）、`personalBests`。
- service 单测：所有权（`ownSeason`）、Pro 门禁、赛事归属校验、公开未发布 404。
- e2e：建赛季→两场赛事归入→录成绩→`GET /seasons/:id/standings` 累计正确→`GET /records` 纪录正确→`GET /me/records` PB→发布→`/public/seasons/:id`(+records) 可见且**无 email**→未发布 `404`。
- web/swimmer：赛季管理 + 积分榜渲染；公开赛季页；swimmer PB 页。

## 非目标（E5）

可配置分值表、跨 owner 排行、报名费/支付、纪录的完整历史时序（"在某场打破"逐场回放）、相对/标准分（FINA points）。这些留待后续。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；迁移随 e2e 全局 setup 应用；README 增 E5 段 + 接口表；自评审；合并 main + 推送 + 删分支。
