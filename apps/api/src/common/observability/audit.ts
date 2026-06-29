import type { Request, Response } from 'express';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export interface AuditEntry {
  audit: true;
  actor: { id: string; role?: string } | null;
  action: string;
  status: number;
  requestId: string | null;
  durationMs: number;
}

/** Writes (POST/PATCH/PUT/DELETE) are the security-relevant actions worth auditing. */
export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

type AuditRequest = Request & { user?: { id: string; role?: string }; id?: string };

/** Structured audit record for one completed mutating request: who did what, with what outcome. */
export function buildAuditEntry(req: AuditRequest, res: Response, durationMs: number): AuditEntry {
  const route = (req.route?.path as string | undefined) ?? 'unmatched';
  return {
    audit: true,
    actor: req.user ? { id: req.user.id, role: req.user.role } : null,
    action: `${req.method} ${route}`,
    status: res.statusCode,
    requestId: req.id ?? null,
    durationMs,
  };
}
