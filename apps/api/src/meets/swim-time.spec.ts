import { formatSwimTime, parseSwimTime } from './swim-time';

describe('swim-time', () => {
  it('format ms → m:ss.SS', () => {
    expect(formatSwimTime(62340)).toBe('1:02.34');
    expect(formatSwimTime(32100)).toBe('32.10');
    expect(formatSwimTime(0)).toBe('0.00');
  });

  it('parse m:ss.SS / ss.SS / ss → ms；非法 → null', () => {
    expect(parseSwimTime('1:02.34')).toBe(62340);
    expect(parseSwimTime('32.10')).toBe(32100);
    expect(parseSwimTime('32')).toBe(32000);
    expect(parseSwimTime('1:02')).toBe(62000);
    expect(parseSwimTime('bad')).toBeNull();
    expect(parseSwimTime('1:99.00')).toBeNull();
  });

  it('往返一致', () => {
    expect(formatSwimTime(parseSwimTime('2:05.67')!)).toBe('2:05.67');
  });
});
