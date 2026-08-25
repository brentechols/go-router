export const ROUTE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Names occupied by the HTTP service itself after lookup normalization. */
export const RESERVED_ROUTE_NAMES = new Set([
  "admin",
  "api",
  "assets",
  "favicon",
  "healthz",
  "readyz",
]);

export type NameValidationResult =
  { valid: true; name: string; normalizedName: string } | { valid: false; message: string };

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_]/g, "");
}

export function validateName(value: string): NameValidationResult {
  const name = value.trim().toLowerCase();

  if (!ROUTE_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      message:
        "Names must be 1-64 characters, begin with a letter or number, and contain only lowercase letters, numbers, hyphens, or underscores.",
    };
  }

  const normalizedName = normalizeName(name);
  if (RESERVED_ROUTE_NAMES.has(normalizedName)) {
    return { valid: false, message: `The name "${name}" is reserved by the service.` };
  }

  return { valid: true, name, normalizedName };
}
