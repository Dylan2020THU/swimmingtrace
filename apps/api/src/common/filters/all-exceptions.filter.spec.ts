import { AllExceptionsFilter } from './all-exceptions.filter';
import { BadRequestException, ArgumentsHost } from '@nestjs/common';

function mockHost(method = 'GET', url = '/x', id: string | undefined = 'req-123') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const req = { method, url, id };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('HttpException → 正确 status + 信封字段齐全', () => {
    const { host, status, json } = mockHost();
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 400, message: 'bad input', requestId: 'req-123', path: '/x' });
    expect(typeof body.timestamp).toBe('string');
    expect(body.error).toBeTruthy();
  });

  it('class-validator 数组 message 透传', () => {
    const { host, json } = mockHost();
    filter.catch(
      new BadRequestException({ message: ['a must be a string', 'b is required'], error: 'Bad Request', statusCode: 400 }),
      host,
    );
    expect(json.mock.calls[0][0].message).toEqual(['a must be a string', 'b is required']);
  });

  it('未知 Error → 500 + 通用 message + 含 requestId 且不含 stack', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('boom secret stack'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(body.requestId).toBe('req-123');
    expect(JSON.stringify(body)).not.toContain('secret stack');
  });

  it('req.id 缺失时回退 unknown', () => {
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json }) }),
        getRequest: () => ({ method: 'GET', url: '/y' }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new Error('x'), host);
    expect(json.mock.calls[0][0].requestId).toBe('unknown');
  });
});
