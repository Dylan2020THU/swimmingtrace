import { paginate } from './pagination';

describe('paginate', () => {
  it('默认 page=1 pageSize=20 skip=0', () => {
    expect(paginate()).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });
  it('page=3 pageSize=10 → skip=20', () => {
    expect(paginate(3, 10)).toEqual({ skip: 20, take: 10, page: 3, pageSize: 10 });
  });
  it('pageSize 上限 100、非法回落默认', () => {
    expect(paginate(1, 500).pageSize).toBe(100);
    expect(paginate(0, 0)).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });
});
