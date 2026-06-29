import { observabilityMiddleware } from './observability.middleware';

function makeRes(statusCode: number) {
  let finishCb: (() => void) | undefined;
  const res: any = {
    statusCode,
    on: (evt: string, cb: () => void) => {
      if (evt === 'finish') finishCb = cb;
    },
    triggerFinish: () => finishCb?.(),
  };
  return res;
}

describe('observabilityMiddleware', () => {
  it('finish 时记录指标', () => {
    const metrics = { observe: jest.fn() } as any;
    const logger = { info: jest.fn() };
    const mw = observabilityMiddleware(metrics, logger);
    const req: any = { method: 'GET', route: { path: '/health' } };
    const res = makeRes(200);
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    res.triggerFinish();
    expect(metrics.observe).toHaveBeenCalledWith('GET', '/health', 200, expect.any(Number));
  });

  it('改动型请求输出审计；GET 不输出', () => {
    const metrics = { observe: jest.fn() } as any;
    const logger = { info: jest.fn() };
    const mw = observabilityMiddleware(metrics, logger);

    const post: any = { method: 'POST', route: { path: '/pools' }, user: { id: 'u1', role: 'OWNER' }, id: 'r1' };
    const postRes = makeRes(201);
    mw(post, postRes, jest.fn());
    postRes.triggerFinish();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ audit: true, action: 'POST /pools', status: 201 }),
      'audit',
    );

    logger.info.mockClear();
    const get: any = { method: 'GET', route: { path: '/pools' } };
    const getRes = makeRes(200);
    mw(get, getRes, jest.fn());
    getRes.triggerFinish();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
