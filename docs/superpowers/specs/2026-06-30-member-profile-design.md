# 会员个人主页（GitHub 风格）

> canonical：本 spec。把 owner 端 `/swimmers/:sid`（SwimmerStatsPage）从「概览卡 + 热力图」升级为完整会员主页：个人基本信息 + 训练概览 + 活动热力图（**年份选择器**）+ 训练明细（按月分组，对标 GitHub contribution activity）。

## 布局（两栏）
- **左 · 个人基本信息卡**：头像（姓名/邮箱首字母，无照片上传）+ 姓名 + 邮箱 + 性别/年龄组标签；`Descriptions`（性别、年龄组、认领状态、注册时间）；**所属泳池**列表（泳池名 + 状态标签 + 加入日期；会员可在 owner 名下多个泳池）。
- **右（堆叠）**：① 会员训练概览（**全期**总里程/次数/时长，稳定头部，不随年份变）；② 活动热力图 + **年份选择器**；③ 训练明细：按月倒序分组，每月小标题「YYYY年M月 · N 次 · D 米」+ 逐条「日期 · 泳池 · 距离 · 时长」，底部「加载更多」。

> 年份选择器驱动**热力图 + 训练明细**（对标 GitHub 年份按钮控制贡献图 + 活动流）；概览总计保持全期。年份选项 = 会员注册年（`createdAt`）→ 今年（倒序），前端生成，无需额外端点。

## 后端（`@Roles(OWNER)` + `assertOwnsSwimmer`）
- `GET /stats/swimmer/:sid?year=YYYY`（**扩展现有**）：`swimmerStats(ownerId, sid, year?)`——summary 仍全期；heatmap 改用传入年份（缺省今年）。向后兼容。
- `GET /stats/swimmer/:sid/profile`（新）：`memberProfile`——`User`（name/email/gender/birthDate/claimedAt/createdAt）+ 该会员在 owner 名下泳池的所有 `Registration`（poolName/status/joinedAt）。
- `GET /stats/swimmer/:sid/sessions?year=&page=&pageSize=`（新）：`memberSessions`——该会员在 owner 名下泳池的训练，`swamAt` 倒序分页，含 poolName；year 缺省今年。复用 `paginate`。

## shared 新类型
```ts
export interface MemberProfile {
  swimmerId: string; name: string | null; email: string;
  gender: Gender | null; birthDate: string | null;
  claimedAt: string | null; createdAt: string;
  pools: Array<{ poolId: string; poolName: string; status: RegistrationStatus; joinedAt: string }>;
}
export interface MemberSessionRow {
  id: string; swamAt: string; distanceMeters: number;
  durationSeconds: number | null; poolId: string | null; poolName: string | null;
}
```

## 安全
三个端点均 owner-only + `assertOwnsSwimmer`（非本人会员 → 403，沿用已测守卫）；只查 owner 名下泳池的登记/训练；不泄漏其它 owner 数据/无 PII 越权。

## 测试
- 后端单测：`swimmerStats(year)` heatmap 用对年份；`memberProfile`（含 pools 投影 + 所有权 403）；`memberSessions`（倒序分页 + poolName + 所有权 403）。
- e2e：owner 看自己会员 profile/sessions 200、跨 owner 403、分页 + poolName + year 过滤。
- 前端：SwimmerStatsPage 渲染信息块（姓名/性别/年龄组/泳池）+ 概览 + 热力图 + 训练明细（月分组）；切年份触发带 year 的请求；加载更多翻页。msw 默认补 profile/sessions handler。

## 非目标
头像照片上传、移动端会员主页、训练明细高级筛选、概览的年份化（保持全期）。

## 验收门
四工作区 lint/build/test/e2e 全绿（无迁移）；对抗式评审 workflow；README 增「会员主页」段；合并 main。
