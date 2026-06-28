const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** 解析 "15m"/"30d"/"500ms" 为毫秒。非法即抛错。 */
export function parseDurationMs(input: string): number {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: "${input}"`);
  return Number(m[1]) * UNIT_MS[m[2]];
}
