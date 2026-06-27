import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/** 优先回显入站 x-request-id，否则生成 UUID；并把最终 id 写回响应头。 */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}
