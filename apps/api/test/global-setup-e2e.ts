import { Client } from 'pg';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * One-time e2e bootstrap: provision an isolated `swim_test` database (so e2e
 * never touches the dev/seed data) and apply migrations to it. Runs once before
 * all e2e suites. Connection defaults match docker-compose; override with
 * DATABASE_URL_ADMIN / DATABASE_URL_TEST in CI if needed.
 */
const ADMIN_DB_URL = process.env.DATABASE_URL_ADMIN || 'postgresql://swim:swim@localhost:5432/swim';
const TEST_DB_URL = process.env.DATABASE_URL_TEST || 'postgresql://swim:swim@localhost:5432/swim_test?schema=public';
const TEST_DB_NAME = 'swim_test';

export default async function globalSetup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit',
  });
}
