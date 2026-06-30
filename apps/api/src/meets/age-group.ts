export interface AgeBand {
  label: string;
  minAge?: number;
  maxAge?: number;
}

/** Standard swim age bands, computed by actual age on the meet date. Tunable. */
export const AGE_GROUPS: AgeBand[] = [
  { label: '10及以下', maxAge: 10 },
  { label: '11-12', minAge: 11, maxAge: 12 },
  { label: '13-14', minAge: 13, maxAge: 14 },
  { label: '15-17', minAge: 15, maxAge: 17 },
  { label: '18及以上', minAge: 18 },
];

/** Whole-years age of `birthDate` as of `on`. */
export function ageAt(birthDate: Date, on: Date): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

export function ageGroupOf(birthDate: Date, meetDate: Date): string {
  const age = ageAt(birthDate, meetDate);
  for (const b of AGE_GROUPS) {
    if ((b.minAge === undefined || age >= b.minAge) && (b.maxAge === undefined || age <= b.maxAge)) {
      return b.label;
    }
  }
  return AGE_GROUPS[AGE_GROUPS.length - 1].label;
}
