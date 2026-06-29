# #5 可观测性++ 设计

> 承接 #1（pino 结构化日志 + 请求 ID + /health、/health/ready）。canonical：本 spec。

## 目标

把 API 从“有日志”推进到“可被监控系统观测 + 关键写操作可审计”：
1. **Prometheus 指标**：默认进程指标 + HTTP 请求指标，`GET /metrics` 暴露。
2. **审计轨迹**：对**改动型请求**（POST/PATCH/PUT/DELETE）输出结构化审计日志（谁、做了什么、结果）。

## 范围

**做：**
- `prom-client` 依赖；`MetricsService` 持有**独立 Registry**（每实例隔离，避免测试间重复注册）：
  - `collectDefaultMetrics`（CPU/内存/事件循环/GC 等）。
  - 直方图 `http_request_duration_seconds`（标签 `method`/`route`/`status_code`）。
  - 计数器 `http_requests_total`（同标签）。
- `GET /metrics`：public、`@SkipThrottle()`、`text/plain; version=0.0.4`；由 `METRICS_ENABLED`（默认 `true`）门控（关闭时返回 404 风格——直接不注册控制器或返回 503，取最简：env=false 时控制器返回 404 Not Found）。
- 全局 `observabilityMiddleware`（在 `res.on('finish')` 触发，捕获**所有**请求含 404 / 守卫拒绝）：
  - `route = req.route?.path ?? 'unmatched'`（用路由模板而非含 UUID 的原始路径，避免标签爆炸）。
  - 调 `metrics.observe(method, route, status, durationMs)`。
  - 对改动型方法，经 pino 输出审计行 `buildAuditEntry(req, res, durationMs)`。
- `buildAuditEntry`（纯函数）：`{ audit: true, actor: {id, role} | null, action: '<METHOD> <route>', status, requestId, durationMs }`。
- env.validation：接受可选 `METRICS_ENABLED`（默认 `'true'`）。

**不做（非目标）：**
- 分布式追踪 / OpenTelemetry（需 collector，另立项）。
- 告警、日志投递（Loki/ELK）、Grafana 仪表盘。
- 审计**落库**（本片仅审计**日志**；若需可查询审计存储，归入 #7）。
- 业务级逐端点埋点（统一中间件足矣）。

## 架构

- `metrics/metrics.service.ts` — `observe(method, route, status, durationMs)`、`render(): Promise<string>`、`contentType`。
- `metrics/metrics.controller.ts` — `GET /metrics`（env 关时 404）。
- `metrics/metrics.module.ts` — provide service + controller，**export MetricsService**（供 main.ts 中间件取用）。
- `common/observability/audit.ts` — `buildAuditEntry`。
- `common/observability/observability.middleware.ts` — `observabilityMiddleware(metrics, logger)` 工厂。
- `main.ts` — `app.use(observabilityMiddleware(app.get(MetricsService), app.get(Logger)))`（在路由前注册；`res.on('finish')` 保证拿到 `req.route` 与最终 `statusCode`）。

中间件先于路由执行，但其 `finish` 回调在响应结束时运行，此时 `req.route`（匹配到的模板）与 `res.statusCode` 均已就绪。

## 接口契约

- `GET /metrics` → `200`，`text/plain`，Prometheus 文本格式；含 `process_*`、`http_request_duration_seconds_*`、`http_requests_total`。
- `METRICS_ENABLED=false` → `GET /metrics` 返回 `404`。
- 审计：每个改动型请求在完成时产生一条 `info` 级 pino 日志，含 `audit:true` 与 actor/action/status/requestId/durationMs。

## 测试

- `metrics.service.spec.ts`：`observe()` 后 `render()` 含指标名与标签；默认指标存在；多实例不冲突。
- `audit.spec.ts`：`buildAuditEntry` —— 认证改动（含 actor）、匿名（actor=null）、GET 不产生 action 误配；status/duration 透传。
- `observability.middleware.spec.ts`：`finish` 时调用 `metrics.observe`；改动型请求调用 logger（mock），GET 不输出审计。
- e2e `observability.e2e-spec.ts`：先打一两个请求，`GET /metrics` → 200 且文本含 `http_requests_total` 与 `process_`；`METRICS_ENABLED` 默认开。

## 验收门

lint/build/test（api+web+swimmer）/e2e 全绿；README 增可观测性段；自评审；合并 main。
