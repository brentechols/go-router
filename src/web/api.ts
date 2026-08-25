import type {
  CreateRouteInput,
  RouteListResponse,
  RouteRecord,
  UpdateRouteInput,
} from "../shared/schemas";

export type RouteSort = "name" | "createdAt" | "updatedAt" | "hitCount" | "lastUsedAt";
export type SortOrder = "asc" | "desc";

export interface ListRoutesParams {
  limit?: number;
  cursor?: string;
  q?: string;
  tags?: string[];
  sort?: RouteSort;
  order?: SortOrder;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.error?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "REQUEST_FAILED";
    this.details = body?.error?.details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // A reverse proxy may replace the JSON error body. The status is still useful.
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function listRoutes(params: ListRoutesParams): Promise<RouteListResponse> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 50));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.q) search.set("q", params.q);
  if (params.tags?.length) search.set("tags", params.tags.join(","));
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);

  return request<RouteListResponse>(`/api/v1/routes?${search.toString()}`);
}

export function getRoute(id: string): Promise<RouteRecord> {
  return request<RouteRecord>(`/api/v1/routes/${encodeURIComponent(id)}`);
}

export function createRoute(input: CreateRouteInput): Promise<RouteRecord> {
  return request<RouteRecord>("/api/v1/routes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRoute(id: string, input: UpdateRouteInput): Promise<RouteRecord> {
  return request<RouteRecord>(`/api/v1/routes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteRoute(id: string): Promise<void> {
  return request<void>(`/api/v1/routes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
