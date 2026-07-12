import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

export function ApiObjectOk(description: string): MethodDecorator {
  return applyDecorators(
    ApiOkResponse({
      description,
      schema: { type: 'object', additionalProperties: true },
    }),
  );
}

export function ApiObjectArrayOk(description: string): MethodDecorator {
  return applyDecorators(
    ApiOkResponse({
      description,
      schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }),
  );
}
