import type { ApiErrorPayload } from './types';
import type { paths } from './generated/openapi';

type OpenApiHttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

type OperationAt<Path extends keyof paths, Method extends OpenApiHttpMethod> =
  paths[Path] extends Partial<Record<Method, infer Operation>>
    ? Exclude<Operation, undefined>
    : never;

type GeneratedPathTemplate<Method extends OpenApiHttpMethod> = {
  [Path in keyof paths]: [OperationAt<Path, Method>] extends [never] ? never : Path;
}[keyof paths] &
  string;

type ExpandPathParameters<Path extends string> =
  Path extends `${infer Prefix}{${string}}${infer Suffix}`
    ? `${Prefix}${string}${ExpandPathParameters<Suffix>}`
    : Path;

type ExpandGeneratedUrl<Path extends string> = Path extends unknown
  ? ExpandPathParameters<Path> | `${ExpandPathParameters<Path>}?${string}`
  : never;

/**
 * Concrete same-origin URLs accepted by the generated OpenAPI contract for a method.
 * This keeps every UI query/mutation coupled to the committed generated artifact while
 * still allowing encoded path parameters and query strings at call sites.
 */
export type GeneratedUrlFor<Method extends OpenApiHttpMethod> = ExpandGeneratedUrl<
  GeneratedPathTemplate<Method>
>;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.error.code;
    this.requestId = payload.error.requestId;
    this.details = payload.error.details;
  }
}

function apiBase(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    cache: init?.cache ?? 'no-store',
  });
  if (!response.ok) {
    const fallback: ApiErrorPayload = {
      error: { code: 'HTTP_ERROR', message: `Запрос завершился с кодом ${response.status}` },
    };
    let payload = fallback;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The stable fallback keeps non-JSON proxy failures readable.
    }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiFetch<TResponse, TPath extends GeneratedUrlFor<'get'> = GeneratedUrlFor<'get'>>(
  path: TPath,
  init?: Omit<RequestInit, 'method'> & { method?: 'GET' },
): Promise<TResponse> {
  return request<TResponse>(path, init);
}

type MutationArguments<TBody> =
  | [path: GeneratedUrlFor<'delete'>, method: 'DELETE', body?: TBody]
  | [path: GeneratedUrlFor<'patch'>, method: 'PATCH', body?: TBody]
  | [path: GeneratedUrlFor<'post'>, method: 'POST', body?: TBody]
  | [path: GeneratedUrlFor<'put'>, method: 'PUT', body?: TBody];

export function apiMutation<TResponse = unknown, TBody = unknown>(
  ...[path, method, body]: MutationArguments<TBody>
): Promise<TResponse> {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  return request<TResponse>(path, init);
}
