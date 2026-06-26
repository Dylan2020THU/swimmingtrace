// Runs in each test worker BEFORE the test module (and AppModule / ConfigModule)
// loads, so the API points at an isolated test database with a valid JWT secret.
// dotenv (via ConfigModule) does not override values already present in process.env,
// so these take precedence over apps/api/.env when running e2e.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-0123456789abcdef';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST || 'postgresql://swim:swim@localhost:5432/swim_test?schema=public';
process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || 'UTC';
