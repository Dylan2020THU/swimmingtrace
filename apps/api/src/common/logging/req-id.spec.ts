import { genReqId } from './req-id';

function mk(headers: Record<string, unknown> = {}) {
  const setHeader = jest.fn();
  return { req: { headers } as never, res: { setHeader } as never, setHeader };
}

describe('genReqId', () => {
  it('回显入站 x-request-id 并写响应头', () => {
    const { req, res, setHeader } = mk({ 'x-request-id': 'abc-1' });
    expect(genReqId(req, res)).toBe('abc-1');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-1');
  });

  it('入站缺失时生成非空 id 并写响应头', () => {
    const { req, res, setHeader } = mk();
    const id = genReqId(req, res);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
  });
});
