import { Gender, SeasonStandingRow, SeasonStandingsGroup } from '@swim/shared';
import { AGE_GROUPS } from './age-group';
import { StandingEntry, computeStandings } from './standings';

/** FINA-style individual points for a finishing rank; 0 for 9th+ or unranked (DNS/DNF/DQ). */
const POINTS: Record<number, number> = { 1: 9, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };
const GENDER_ORDER: Record<Gender, number> = { MALE: 0, FEMALE: 1 };

export function pointsForRank(rank: number | null): number {
  if (rank == null) return 0;
  return POINTS[rank] ?? 0;
}

export interface SeasonEvent {
  entries: StandingEntry[];
}

/**
 * Cross-meet season points: for each event, place swimmers within (gender × age group)
 * at `referenceDate` (so a swimmer stays in one group all season), award points by rank,
 * accumulate per swimmer. Returns groups sorted gender×age-group; rows by points desc
 * (ties share rank). Swimmers with zero total points are omitted.
 */
export function seasonPoints(events: SeasonEvent[], referenceDate: Date): SeasonStandingsGroup[] {
  const groups = new Map<string, { gender: Gender; ageGroup: string; swimmers: Map<string, { name: string | null; points: number }> }>();
  for (const ev of events) {
    for (const g of computeStandings(ev.entries, referenceDate)) {
      const key = `${g.gender}__${g.ageGroup}`;
      let grp = groups.get(key);
      if (!grp) {
        grp = { gender: g.gender, ageGroup: g.ageGroup, swimmers: new Map() };
        groups.set(key, grp);
      }
      for (const row of g.rows) {
        const pts = pointsForRank(row.rank);
        const cur = grp.swimmers.get(row.swimmerId);
        if (cur) {
          cur.points += pts;
          if (cur.name == null && row.name != null) cur.name = row.name;
        } else {
          grp.swimmers.set(row.swimmerId, { name: row.name, points: pts });
        }
      }
    }
  }

  const out: SeasonStandingsGroup[] = [];
  for (const grp of groups.values()) {
    const sorted = [...grp.swimmers.entries()]
      .map(([swimmerId, v]) => ({ swimmerId, name: v.name, points: v.points }))
      .filter((s) => s.points > 0)
      .sort((a, b) => b.points - a.points);
    if (sorted.length === 0) continue;
    const rows: SeasonStandingRow[] = [];
    let prevPoints: number | null = null;
    let prevRank = 0;
    sorted.forEach((s, i) => {
      const rank = prevPoints !== null && s.points === prevPoints ? prevRank : i + 1;
      prevPoints = s.points;
      prevRank = rank;
      rows.push({ rank, swimmerId: s.swimmerId, name: s.name, points: s.points });
    });
    out.push({ gender: grp.gender, ageGroup: grp.ageGroup, rows });
  }

  const ageIdx = (label: string) => AGE_GROUPS.findIndex((b) => b.label === label);
  return out.sort((a, b) => GENDER_ORDER[a.gender] - GENDER_ORDER[b.gender] || ageIdx(a.ageGroup) - ageIdx(b.ageGroup));
}
