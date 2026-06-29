import { buildAuditEntry, isMutating } from './audit';

const mkReq = (over: Record<string, unknown> = {}) =>
  ({ method: 'POST', route: { path: '/pools' }, user: { id: 'u1', role: 'OWNER' }, id: 'req-1', ...over }) as any;

describe('isMutating', () => {
  it('GET 非改动；POST/PATCH/PUT/DELETE 改动（大小写不敏感）', () => {
    expect(isMutating('GET')).toBe(false);
    expect(isMutating('post')).toBe(true);
    expect(isMutating('PATCH')).toBe(true);
    expect(isMutating('delete')).toBe(true);
  });
});

describe('buildAuditEntry', () => {
  it('认证改动：actor + action + status + duration', () => {
    const e = buildAuditEntry(mkReq(), { statusCode: 201 } as any, 5);
    expect(e).toMatchObject({
      audit: true,
      actor: { id: 'u1', role: 'OWNER' },
      action: 'POST /pools',
      status: 201,
      requestId: 'req-1',
      durationMs: 5,
    });
  });

  it('匿名（无 user）→ actor=null', () => {
    const e = buildAuditEntry(mkReq({ user: undefined }), { statusCode: 401 } as any, 2);
    expect(e.actor).toBeNull();
  });

  it('未匹配路由 → action 用 unmatched 而非含 id 的原始路径', () => {
    const e = buildAuditEntry(mkReq({ route: undefined }), { statusCode: 404 } as any, 1);
    expect(e.action).toBe('POST unmatched');
  });
});
