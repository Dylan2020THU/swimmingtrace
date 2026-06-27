import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorResponse } from '@swim/shared';

/**
 * Catches every thrown error and maps it to the uniform ApiErrorResponse
 * envelope. HttpExceptions keep their status + message; unknown errors become
 * a generic 500 with the full stack logged (never returned in the body).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = req.id ?? 'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
        error = exception.name.replace(/Exception$/, '');
      } else if (resp && typeof resp === 'object') {
        const r = resp as { message?: string | string[]; error?: string };
        message = r.message ?? message;
        error = r.error ?? exception.name.replace(/Exception$/, '');
      }
    }

    const body: ApiErrorResponse = {
      statusCode: status,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status} [${requestId}]`);
    }

    res.status(status).json(body);
  }
}
