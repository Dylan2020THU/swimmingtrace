import { Gender, PbRow, RecordRow, ResultStatus, Stroke } from '@swim/shared';
import { AGE_GROUPS, ageGroupOf } from './age-group';

export interface RecordEntry {
  ownerId: string;
  swimmerId: string;
  name: string | null;
  gender: Gender | null;
  birthDate: Date | null;
  distanceMeters: number;
  stroke: Stroke;
  resultTimeMs: number | null;
  resultStatus: ResultStatus;
  meetName: string;
  meetDate: Date;
}

const STROKE_ORDER: Record<Stroke, number> = { FREE: 0, BACK: 1, BREAST: 2, FLY: 3, IM: 4 };
const GENDER_ORDER: Record<Gender, number> = { MALE: 0, FEMALE: 1 };
const ageIdx = (label: string) => AGE_GROUPS.findIndex((b) => b.label === label);

const isFinished = (e: RecordEntry): e is RecordEntry & { resultTimeMs: number; gender: Gender; birthDate: Date } =>
  e.resultStatus === 'OK' && e.resultTimeMs != null && !!e.gender && !!e.birthDate;

/**
 * Club records: the fastest OK time per (distance × stroke × gender × age-group),
 * age-group computed at each entry's own meet date (a record is set in the age group
 * you were at the time). Records carry no ownerId (PII-safe for public projection).
 */
export function clubRecords(entries: RecordEntry[]): RecordRow[] {
  const best = new Map<string, RecordRow>();
  for (const e of entries) {
    if (!isFinished(e)) continue;
    const ageGroup = ageGroupOf(e.birthDate, e.meetDate);
    const key = `${e.ownerId}__${e.distanceMeters}__${e.stroke}__${e.gender}__${ageGroup}`;
    const cur = best.get(key);
    if (!cur || e.resultTimeMs < cur.timeMs) {
      best.set(key, {
        distanceMeters: e.distanceMeters,
        stroke: e.stroke,
        gender: e.gender,
        ageGroup,
        swimmerId: e.swimmerId,
        name: e.name,
        timeMs: e.resultTimeMs,
        meetName: e.meetName,
        meetDate: e.meetDate.toISOString(),
      });
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      a.distanceMeters - b.distanceMeters ||
      STROKE_ORDER[a.stroke] - STROKE_ORDER[b.stroke] ||
      GENDER_ORDER[a.gender] - GENDER_ORDER[b.gender] ||
      ageIdx(a.ageGroup) - ageIdx(b.ageGroup),
  );
}

/**
 * A single swimmer's personal best per (distance × stroke), from their OK entries.
 * `isClubRecord` is true when that PB time currently holds a club record (matched in `records`).
 */
export function personalBests(entries: RecordEntry[], records: RecordRow[]): PbRow[] {
  const best = new Map<string, { distanceMeters: number; stroke: Stroke; timeMs: number; meetName: string; meetDate: Date; swimmerId: string }>();
  for (const e of entries) {
    if (e.resultStatus !== 'OK' || e.resultTimeMs == null) continue;
    const key = `${e.distanceMeters}__${e.stroke}`;
    const cur = best.get(key);
    if (!cur || e.resultTimeMs < cur.timeMs) {
      best.set(key, { distanceMeters: e.distanceMeters, stroke: e.stroke, timeMs: e.resultTimeMs, meetName: e.meetName, meetDate: e.meetDate, swimmerId: e.swimmerId });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters || STROKE_ORDER[a.stroke] - STROKE_ORDER[b.stroke])
    .map((p) => ({
      distanceMeters: p.distanceMeters,
      stroke: p.stroke,
      timeMs: p.timeMs,
      meetName: p.meetName,
      meetDate: p.meetDate.toISOString(),
      isClubRecord: records.some(
        (r) => r.distanceMeters === p.distanceMeters && r.stroke === p.stroke && r.swimmerId === p.swimmerId && r.timeMs === p.timeMs,
      ),
    }));
}
