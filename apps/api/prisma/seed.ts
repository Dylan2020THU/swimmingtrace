/**
 * Seed — demo / acceptance data for the OWNER console.
 *
 * Creates one OWNER, a few pools (incl. an archived one), 55 swimmers
 * (5 named legacy demos without demographics + 50 generated members with
 * gender / birth dates spanning every age group / mixed claim + status /
 * some in multiple pools), and SwimSessions spread across the last ~120 days
 * so the overview / pool / member-profile dashboards, the GitHub-style
 * heatmap, the age-group columns, filters and leaderboards render with
 * realistic data.
 *
 * Idempotent: wipes the demo graph (by deterministic emails / owner) and
 * re-creates it, so `npm run seed` can be run repeatedly in dev.
 *
 * Run: `npm run seed -w @swim/api`  (or `npm run db:seed` from the repo root)
 */
import { PrismaClient, RegistrationStatus, Gender } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@swim.dev';
const OWNER_PASSWORD = 'password123';

type SeedSwimmer = {
  email: string;
  name: string;
  gender?: Gender;
  birthDate?: Date;
  inactive?: boolean;
  claimed?: boolean;
};

// Legacy named demos (intentionally left without demographics to also exercise
// the "缺资料 / —" empty-state in the roster + age-group columns).
const NAMED: SeedSwimmer[] = [
  { email: 'alice@swim.dev', name: '爱丽丝' },
  { email: 'bob@swim.dev', name: '鲍勃' },
  { email: 'carol@swim.dev', name: '卡罗尔' },
  { email: 'dave@swim.dev', name: '戴夫' },
  { email: 'erin@swim.dev', name: '艾琳' },
];

// --- 50 generated members with full demographics -------------------------
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '文', '辉', '梅', '鹏', '华', '飞', '红', '燕', '建', '波'];
// Ages cycled so members fall across all five age bands (10及以下 … 18及以上).
const AGES = [8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 22, 27, 34, 41];
const THIS_YEAR = new Date().getUTCFullYear();

const GENERATED: SeedSwimmer[] = Array.from({ length: 50 }, (_, k) => {
  const i = k + 1;
  const surname = SURNAMES[i % SURNAMES.length];
  const g1 = GIVEN[(i * 3) % GIVEN.length];
  const g2 = i % 3 === 0 ? GIVEN[(i * 7 + 2) % GIVEN.length] : '';
  const age = AGES[i % AGES.length];
  return {
    email: `member${i}@swim.dev`,
    name: `${surname}${g1}${g2}`,
    gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
    birthDate: new Date(Date.UTC(THIS_YEAR - age, (i * 5) % 12, (i % 27) + 1)),
    inactive: i % 9 === 0, // ~11% stopped
    claimed: i % 2 === 0, // ~half claimed their account
  };
});

const SWIMMERS: SeedSwimmer[] = [...NAMED, ...GENERATED];

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

  const today = new Date();

  // --- Swimmers + registrations -------------------------------------------
  // Reuse one bcrypt hash for all (unclaimed) demo swimmers — keeps 55 inserts fast.
  const placeholderHash = await bcrypt.hash('placeholder', 12);
  const swimmers = [] as { id: string; poolId: string }[];
  for (let i = 0; i < SWIMMERS.length; i++) {
    const s = SWIMMERS[i];
    const user = await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        role: 'SWIMMER',
        passwordHash: placeholderHash,
        gender: s.gender,
        birthDate: s.birthDate,
        claimedAt: s.claimed ? new Date(today.getTime() - ((i % 60) + 1) * DAY_MS) : null,
      },
    });
    // Spread swimmers across the two active pools.
    const pool = i % 2 === 0 ? sunrise : moonlight;
    const status: RegistrationStatus = s.inactive || i === NAMED.length - 1 ? 'INACTIVE' : 'ACTIVE';
    await prisma.registration.create({ data: { swimmerId: user.id, poolId: pool.id, status } });
    // Alice + every 5th generated member also belong to the other pool (multi-pool members).
    if (i === 0 || (i >= NAMED.length && i % 5 === 0)) {
      const other = pool.id === sunrise.id ? moonlight : sunrise;
      await prisma.registration.create({ data: { swimmerId: user.id, poolId: other.id, status: 'ACTIVE' } });
    }
    swimmers.push({ id: user.id, poolId: pool.id });
  }

  // --- Sessions across the last 120 days (batched for speed) ---------------
  const sessionData: { swimmerId: string; poolId: string; distanceMeters: number; durationSeconds: number; swamAt: Date }[] = [];
  for (let i = 0; i < swimmers.length; i++) {
    const { id, poolId } = swimmers[i];
    const rand = rng(1000 + i * 7);
    for (let d = 0; d < 120; d++) {
      // Denser on recent days: P(swim) ≈ 0.3–0.6, higher for recent dates.
      const density = 0.3 + 0.3 * (1 - d / 120);
      if (rand() > density) continue;
      const swamAt = new Date(today.getTime() - d * DAY_MS);
      swamAt.setUTCHours(7 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
      const distanceMeters = 500 + Math.floor(rand() * 11) * 250; // 500..3000
      const durationSeconds = Math.round(distanceMeters / (1.0 + rand() * 0.6)); // ~ pace
      sessionData.push({ swimmerId: id, poolId, distanceMeters, durationSeconds, swamAt });
    }
  }
  await prisma.swimSession.createMany({ data: sessionData });

  console.log(
    `Seed done: owner=${OWNER_EMAIL} / ${OWNER_PASSWORD}, ` +
      `pools=3 (1 archived), swimmers=${SWIMMERS.length} (${GENERATED.length} generated w/ demographics), sessions=${sessionData.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
