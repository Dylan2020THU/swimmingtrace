export interface SeedInput {
  id: string;
  seedTimeMs: number | null;
}
export interface Seeded {
  id: string;
  heat: number;
  lane: number;
}

/**
 * Center-out lane order: fastest swimmer gets the centre lane, then alternating
 * outward. 6 lanes → [3,4,2,5,1,6]; 8 lanes → [4,5,3,6,2,7,1,8].
 */
export function lanePriority(laneCount: number): number[] {
  const mid = Math.ceil(laneCount / 2);
  const out: number[] = [mid];
  for (let d = 1; out.length < laneCount; d++) {
    if (mid + d <= laneCount) out.push(mid + d);
    if (mid - d >= 1) out.push(mid - d);
  }
  return out;
}

/**
 * Championship seeding for timed finals: sort fastest→slowest (no seed time =
 * slowest), put the fastest in the LAST heat, fill backwards; the slowest
 * (possibly short) heat is heat 1. Within a heat, centre lanes go to the faster.
 */
export function seedHeats(entries: SeedInput[], laneCount: number): Seeded[] {
  if (laneCount < 1 || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => {
    if (a.seedTimeMs == null && b.seedTimeMs == null) return 0;
    if (a.seedTimeMs == null) return 1;
    if (b.seedTimeMs == null) return -1;
    return a.seedTimeMs - b.seedTimeMs;
  });
  const heatCount = Math.ceil(sorted.length / laneCount);
  const lanes = lanePriority(laneCount);
  const result: Seeded[] = [];
  for (let c = 0; c < heatCount; c++) {
    const chunk = sorted.slice(c * laneCount, (c + 1) * laneCount); // chunk 0 = fastest
    const heat = heatCount - c; // fastest chunk → last heat
    chunk.forEach((e, i) => result.push({ id: e.id, heat, lane: lanes[i] }));
  }
  return result;
}
