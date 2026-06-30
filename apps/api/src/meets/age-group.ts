// Age bands now live in @swim/shared (reused by owner member tables on the web).
// Re-exported here so the meets domain (standings/records/meets.service) imports stay unchanged.
export type { AgeBand } from '@swim/shared';
export { AGE_GROUPS, ageAt, ageGroupOf } from '@swim/shared';
