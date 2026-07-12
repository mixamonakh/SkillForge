import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiErrorDetails = Readonly<Record<string, unknown>>;

export class ApiError extends HttpException {
  public readonly code: string;
  public readonly details: ApiErrorDetails;

  public constructor(
    code: string,
    message: string,
    status: HttpStatus,
    details: ApiErrorDetails = {},
  ) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}

export function notFound(code: string, message: string): ApiError {
  return new ApiError(code, message, HttpStatus.NOT_FOUND);
}

export function conflict(code: string, message: string, details: ApiErrorDetails = {}): ApiError {
  return new ApiError(code, message, HttpStatus.CONFLICT, details);
}

export function invalidState(code: string, message: string): ApiError {
  return new ApiError(code, message, HttpStatus.UNPROCESSABLE_ENTITY);
}
