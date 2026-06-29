# #5 可观测性++ 实现计划（TDD）

spec：`docs/superpowers/specs/2026-06-29-observability-design.md`。分支 `feat/api-observability`。

## Task 1 — 依赖 + env
- `npm i prom-client -w @swim/api`。
- `env.validation`：`METRICS_ENABLED` 默认 `'true'` 透传（返回对象加该键；非法值不强校验，仅 `'false'` 视为关）。

## Task 2 — MetricsService（红→绿）
- `metrics/metrics.service.ts`：独立 `Registry`；`collectDefaultMetrics({ register })`；直方图 + 计数器（自有 register）；`observe()`、`render()`、`contentType`。
- `metrics.service.spec.ts`：observe 后 render 含 `http_requests_total{...}` 与标签值、`http_request_duration_seconds`；默认指标含 `process_cpu`；两实例并存不抛“already registered”。

## Task 3 — 审计纯函数（红→绿）
- `common/observability/audit.ts`：`buildAuditEntry(req, res, durationMs)`。
- `audit.spec.ts`：认证改动 actor={id,role}、action=`POST /pools`；匿名 actor=null；status/duration 透传。

## Task 4 — 中间件（红→绿）
- `common/observability/observability.middleware.ts`：`observabilityMiddleware(metrics, logger)`；`res.on('finish')` → observe + （改动型）audit。
- `observability.middleware.spec.ts`：mock res（带 on/finish 触发）、req（method/route/user）、metrics、logger：
  - finish → `metrics.observe` 被调（method/route/status/duration）。
  - POST → logger.info 收到 `audit:true` 对象；GET → 不调 logger。

## Task 5 — MetricsModule + 控制器 + 接线
- `metrics/metrics.controller.ts`：`@SkipThrottle() GET /metrics`；`METRICS_ENABLED==='false'` → `throw NotFoundException`；否则 `res.type(contentType).send(await render())`（用 `@Res()` passthrough 或返回字符串 + header）。
- `metrics/metrics.module.ts`：providers [MetricsService]，controllers [MetricsController]，exports [MetricsService]。
- `app.module.ts`：imports MetricsModule。
- `main.ts`：`app.use(observabilityMiddleware(app.get(MetricsService), app.get(Logger)))`。
- 跑 api 单测全绿。

## Task 6 — e2e
- `test/observability.e2e-spec.ts`：init app + 同 main 接线中间件（beforeAll 里 `app.use(...)`）；打一个 `GET /health`；`GET /metrics` → 200，文本含 `http_requests_total`、`process_`。
- 跑 e2e 全绿。

## Task 7 — 终验
- 全量 lint/build/test/e2e；README 增“可观测性”段（/metrics + 审计）；`.env.example` 增 `METRICS_ENABLED`；自评审；合并 main + 推送 + 删分支。
