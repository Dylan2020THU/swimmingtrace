/** Format milliseconds as a swim time `m:ss.SS` (centiseconds), e.g. 62340 → "1:02.34". */
export function formatSwimTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const cc = String(cs).padStart(2, '0');
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}.${cc}` : `${sec}.${cc}`;
}

/** Parse a swim time `m:ss.SS` / `ss.SS` / `ss` into milliseconds; null if malformed. */
export function parseSwimTime(input: string): number | null {
  const m = input.trim().match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseInt(m[2], 10);
  const cs = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
  if (sec >= 60) return null;
  return ((min * 60 + sec) * 100 + cs) * 10;
}

export const STROKE_LABELS: Record<string, string> = {
  FREE: '自由泳',
  BACK: '仰泳',
  BREAST: '蛙泳',
  FLY: '蝶泳',
  IM: '个人混合',
};
