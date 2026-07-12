import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { ApiError } from './api-error.js';

type ValidationResponse = {
  message?: unknown;
  error?: unknown;
};

function errorMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null) {
    const { message } = response as ValidationResponse;
    if (Array.isArray(message))
      return message.filter((item): item is string => typeof item === 'string').join('; ');
    if (typeof message === 'string') return message;
  }
  return exception.message;
}

function validationDetails(exception: HttpException): Readonly<Record<string, unknown>> {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null) return {};
  const { message } = response as ValidationResponse;
  return Array.isArray(message) ? { violations: message } : {};
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(private readonly logger: Logger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const requestId = request.id;
    const isHttp = exception instanceof HttpException;
    const status: number = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code =
      exception instanceof ApiError
        ? exception.code
        : status === 400
          ? 'VALIDATION_ERROR'
          : status === 404
            ? 'ROUTE_NOT_FOUND'
            : status >= 500
              ? 'INTERNAL_ERROR'
              : 'HTTP_ERROR';
    const message =
      status >= 500
        ? 'Внутренняя ошибка сервера'
        : isHttp
          ? errorMessage(exception)
          : 'Внутренняя ошибка сервера';
    const details =
      exception instanceof ApiError
        ? exception.details
        : isHttp
          ? validationDetails(exception)
          : {};

    if (status >= 500) {
      this.logger.error(
        {
          requestId,
          route: request.routeOptions.url,
          status,
          errorCode: code,
          err: exception instanceof Error ? exception : new Error(String(exception)),
        },
        'API request failed',
      );
    } else {
      this.logger.warn(
        { requestId, route: request.routeOptions.url, status, errorCode: code },
        'API request rejected',
      );
    }

    void reply.status(status).send({ error: { code, message, requestId, details } });
  }
}
