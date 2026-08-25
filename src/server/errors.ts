export type ServiceErrorCode =
  "NOT_FOUND" | "NAME_CONFLICT" | "INVALID_CURSOR" | "VALIDATION_ERROR";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ServiceErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
