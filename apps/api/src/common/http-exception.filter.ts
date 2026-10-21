import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Uniform error body: { statusCode, message, code?, errors? }. Never leaks stack traces. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      const message = Array.isArray(obj.message) ? obj.message.join(', ') : (obj.message ?? exception.message);
      res.status(status).json({
        statusCode: status,
        message,
        ...(obj.code ? { code: obj.code } : {}),
        ...(obj.errors ? { errors: obj.errors } : {}),
      });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Something went wrong' });
  }
}
