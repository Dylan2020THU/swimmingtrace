/**
 * Seed — demo / acceptance data for the OWNER console.
 *
 * Creates one OWNER, a few pools (incl. an archived one), several swimmers
 * (incl. an INACTIVE membership), and SwimSessions spread across the last
 * ~120 days so the overview / pool / swimmer dashboards and the GitHub-style
 * heatmap render with realistic data.
 *
 * Idempotent: wipes the demo graph (by deterministic emails / owner) and
 * re-creates it, so `npm run seed` can be run repeatedly in dev.
 *
 * Run: `npm run seed -w @swim/api`  (or `npm run db:seed` from the repo root)
 */
import { PrismaClient, RegistrationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@swim.dev';
const OWNER_PASSWORD = 'password123';

const SWIMMERS = [
  { email: 'alice@swim.dev', name: '爱丽丝' },
  { email: 'bob@swim.dev', name: '鲍勃' },
  { email: 'carol@swim.dev', name: '卡罗尔' },
  { email: 'dave@swim.dev', name: '戴夫' },
  { email: 'erin@swim.dev', name: '艾琳' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic-ish pseudo-random in [0,1) seeded by an integer. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function main() {
  const allEmails = [OWNER_EMAIL, ...SWIMMERS.map((s) => s.email)];

  // --- Idempotency: remove any previous demo graph -------------------------
  const existing = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { id: true },
  });
  const existingIds = existing.map((u) => u.id);
  if (existingIds.length) {
    await prisma.swimSession.deleteMany({ where: { swimmerId: { in: existingIds } } });
    await prisma.registration.deleteMany({ where: { swimmerId: { in: existingIds } } });
    // Challenges reference the owner's pools — clear them before the pools (FK).
    await prisma.challenge.deleteMany({ where: { pool: { owner: { email: OWNER_EMAIL } } } });
    await prisma.pool.deleteMany({ where: { owner: { email: OWNER_EMAIL } } });
    await prisma.user.deleteMany({ where: { id: { in: existingIds } } });
  }

  // --- Owner ---------------------------------------------------------------
  const owner = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      name: '示例泳池主',
      role: 'OWNER',
      plan: 'PRO', // 演示账号给 Pro，便于展示两档与功能门禁
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
    },
  });

  // --- Pools (incl. one archived) -----------------------------------------
  const sunrise = await prisma.pool.create({
    data: { name: '晨曦泳池', address: '北京市海淀区中关村大街 1 号', latitude: 39.9837, longitude: 116.3164, ownerId: owner.id },
  });
  const moonlight = await prisma.pool.create({
    data: { name: '月光泳馆', address: '上海市浦东新区世纪大道 88 号', latitude: 31.2336, longitude: 121.5055, ownerId: owner.id },
  });
  await prisma.pool.create({
    data: { name: '旧城游泳馆（已归档）', address: '广州市越秀区', ownerId: owner.id, archivedAt: new Date() },
  });

  // --- Swimmers + registrations -------------------------------------------
  const swimmers = [] as { id: string; poolId: string }[];
  for (let i = 0; i < SWIMMERS.length; i++) {
    const s = SWIMMERS[i];
    const user = await prisma.user.create({
      data: { email: s.email, name: s.name, role: 'SWIMMER', passwordHash: await bcrypt.hash('placeholder', 12) },
    });
    // Spread swimmers across the two active pools; make one INACTIVE.
    const pool = i % 2 === 0 ? sunrise : moonlight;
    const status: RegistrationStatus = i === SWIMMERS.length - 1 ? 'INACTIVE' : 'ACTIVE';
    await prisma.registration.create({ data: { swimmerId: user.id, poolId: pool.id, status } });
    // Alice also belongs to the second pool (a swimmer in multiple pools).
    if (i === 0) await prisma.registration.create({ data: { swimmerId: user.id, poolId: moonlight.id, status: 'ACTIVE' } });
    swimmers.push({ id: user.id, poolId: pool.id });
  }

  // --- Sessions across the last 120 days ----------------------------------
  const today = new Date();
  let sessionCount = 0;
  for (let i = 0; i < swimmers.length; i++) {
    const { id, poolId } = swimmers[i];
    const rand = rng(1000 + i * 7);
    for (let d = 0; d < 120; d++) {
      // Denser on recent days: P(swim) = 1 - density ≈ 0.4–0.7, higher for recent dates.
      const density = 0.3 + 0.3 * (1 - d / 120);
      if (rand() > density) continue;
      const swamAt = new Date(today.getTime() - d * DAY_MS);
      swamAt.setUTCHours(7 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
      const distanceMeters = 500 + Math.floor(rand() * 11) * 250; // 500..3000
      const durationSeconds = Math.round(distanceMeters / (1.0 + rand() * 0.6)); // ~ pace
      await prisma.swimSession.create({ data: { swimmerId: id, poolId, distanceMeters, durationSeconds, swamAt } });
      sessionCount++;
    }
  }

  console.log(
    `Seed done: owner=${OWNER_EMAIL} / ${OWNER_PASSWORD}, ` +
      `pools=3 (1 archived), swimmers=${SWIMMERS.length}, sessions=${sessionCount}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
