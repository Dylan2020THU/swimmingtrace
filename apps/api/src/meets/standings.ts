import { Gender, Medal, ResultStatus, StandingRow, StandingsGroup } from '@swim/shared';
import { AGE_GROUPS, ageGroupOf } from './age-group';

export interface StandingEntry {
  swimmerId: string;
  name: string | null;
  gender: Gender | null;
  birthDate: Date | null;
  resultTimeMs: number | null;
  resultStatus: ResultStatus;
}

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];
const GENDER_ORDER: Record<Gender, number> = { MALE: 0, FEMALE: 1 };

/**
 * Group entries by (gender × age group); within each, rank OK finishers by time
 * (ties share a rank, next distinct time skips), award gold/silver/bronze to the
 * top three. DNS/DNF/DQ and no-time entries are listed with rank null.
 * Entries missing gender/birthDate can't be categorised and are dropped.
 */
export function computeStandings(entries: StandingEntry[], meetDate: Date): StandingsGroup[] {
  const groups = new Map<string, { gender: Gender; ageGroup: string; rows: StandingEntry[] }>();
  for (const e of entries) {
    if (!e.gender || !e.birthDate) continue;
    const ageGroup = ageGroupOf(e.birthDate, meetDate);
    const key = `${e.gender}__${ageGroup}`;
    let g = groups.get(key);
    if (!g) {
      g = { gender: e.gender, ageGroup, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(e);
  }

  const out: StandingsGroup[] = [];
  for (const g of groups.values()) {
    const finished = g.rows
      .filter((e) => e.resultStatus === 'OK' && e.resultTimeMs != null)
      .sort((a, b) => a.resultTimeMs! - b.resultTimeMs!);
    const others = g.rows.filter((e) => !(e.resultStatus === 'OK' && e.resultTimeMs != null));

    const rows: StandingRow[] = [];
    let prevTime: number | null = null;
    let prevRank = 0;
    finished.forEach((e, i) => {
      const rank = prevTime !== null && e.resultTimeMs === prevTime ? prevRank : i + 1;
      prevTime = e.resultTimeMs!;
      prevRank = rank;
      rows.push({
        rank,
        medal: rank <= 3 ? MEDALS[rank - 1] : null,
        swimmerId: e.swimmerId,
        name: e.name,
        resultTimeMs: e.resultTimeMs,
        resultStatus: e.resultStatus,
      });
    });
    for (const e of others) {
      rows.push({ rank: null, medal: null, swimmerId: e.swimmerId, name: e.name, resultTimeMs: e.resultTimeMs, resultStatus: e.resultStatus });
    }
    out.push({ gender: g.gender, ageGroup: g.ageGroup, rows });
  }

  const ageIdx = (label: string) => AGE_GROUPS.findIndex((b) => b.label === label);
  return out.sort((a, b) => GENDER_ORDER[a.gender] - GENDER_ORDER[b.gender] || ageIdx(a.ageGroup) - ageIdx(b.ageGroup));
}
