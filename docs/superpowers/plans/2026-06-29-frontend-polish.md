# #6 前端打磨 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-29-frontend-polish-design.md`。分支 `feat/web-polish`。

## Task 1 — swimmer query-client 工厂（红→绿）
- `apps/swimmer/src/lib/query-client.ts`：`extractErrorMessage(err)` + `createQueryClient(notifyError)`（QueryCache.onError → notifyError）。
- `query-client.test.ts`：`createQueryClient(spy)`，`fetchQuery` reject `{response:{data:{message:'boom'}}}` → spy('boom')；reject 无 message → spy('加载失败，请稍后重试')。

## Task 2 — swimmer ErrorBoundary（红→绿）
- `apps/swimmer/src/components/ErrorBoundary.tsx`：class 组件，`ErrorBlock`（antd-mobile）+ 刷新按钮。
- `ErrorBoundary.test.tsx`：渲染抛错子 → 出现兜底文案。

## Task 3 — swimmer 接线
- `apps/swimmer/src/app/providers.tsx`：用 `createQueryClient((m) => Toast.show({ content: m }))` 替换模块级 client；用 `ErrorBoundary` 包裹 children。
- 跑 swimmer 测试全绿。

## Task 4 — web query-client 工厂（红→绿）
- `apps/web/src/lib/query-client.ts`：`extractErrorMessage` + `createQueryClient(notifyError)`。
- `query-client.test.ts`：同 swimmer。

## Task 5 — web Providers 重构接线
- `apps/web/src/app/providers.tsx`：`ConfigProvider > AntdApp > Inner`；`Inner` 用 `App.useApp().message` 注入，`useState(() => createQueryClient((m) => message.error(m)))`，保留 `getMe` 启动副作用与 `ErrorBoundary`。
- 跑 web 测试全绿（既有用例用 render.tsx，不受影响）。

## Task 6 — 终验
- 全量 lint/build/test；README 增“前端韧性”一句；自评审；合并 main + 推送 + 删分支。
