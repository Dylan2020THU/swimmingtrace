# #6 前端打磨：韧性与错误 UX（两端对齐）

> canonical：本 spec。聚焦“失败不再白屏/静默”，对齐两端体验；不做视觉重构、不加新功能。

## 现状

- web（owner 控制台）：**已有** `ErrorBoundary`（包在 Providers）与 catch-all 路由。
- swimmer（移动端）：**无** ErrorBoundary。
- 两端：`useQuery` 失败**静默**（无提示），用户只见空白/空态，不知发生了网络/服务错误。
- mutation 错误：各组件已用 `message.error`/`Toast` 就地处理（保留，不动）。

## 目标 / 范围

**做：**
1. **swimmer ErrorBoundary**：与 web 对齐——渲染期异常显示友好兜底（antd-mobile `ErrorBlock` + 刷新），包进 swimmer `Providers`。
2. **全局查询错误提示**（两端）：给 QueryClient 配 `QueryCache.onError`，把 query 失败统一弹出（web `message.error`，swimmer `Toast.show`）。抽 `createQueryClient(notifyError)` 工厂（注入通知器）便于测试；只覆盖 **query** 失败（组件未处理的路径），**不触碰** mutation 既有就地处理（避免双弹/回归）。
3. 错误消息提取统一：优先 `error.response.data.message`（数组则用「；」连接），否则默认「加载失败，请稍后重试」。

**不做（非目标）：**
- 视觉/布局重构、主题、骨架屏统一化、i18n、可访问性专项。
- web 独立 404 页（已有 catch-all，YAGNI）。
- 改动任何 mutation 的就地错误处理。
- 重试/退避策略调整（沿用现有 `retry: 1`）。

## 架构

- web：`src/lib/query-client.ts` —— `createQueryClient(notifyError)` + `extractErrorMessage(err)`。`Providers` 重构为 `ConfigProvider > AntdApp > Inner`，`Inner` 用 `App.useApp().message` 注入通知器并 `useState(() => createQueryClient(...))` 建客户端（保留 `getMe` 启动副作用与 `ErrorBoundary`）。
- swimmer：`src/lib/query-client.ts` —— 同形工厂；`Providers` 用 `createQueryClient((m) => Toast.show({ content: m }))`（`Toast` 命令式，无需 context 重构）。`src/components/ErrorBoundary.tsx` 新增并包裹。

## 测试

- swimmer `ErrorBoundary.test.tsx`：抛错子组件 → 显示兜底文案（如「出错了」）。
- web/swimmer `query-client.test.ts`：`createQueryClient(spy)` + `fetchQuery` 拒绝 → spy 收到提取后的消息（含 `response.data.message` 与默认兜底两情形）。
- 既有用例：web/swimmer 测试用各自 `render.tsx`（自带 QueryClient），不受 Providers 重构影响——回归保持绿。

## 验收门

lint/build/test（web+swimmer，api 不变）/e2e（不变）全绿；README 增“前端韧性”一句；自评审；合并 main。
