export function parseDelimitedValues(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

export function parseSampleArguments(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (const character of value.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (escaped) current += "\\";
  if (current) parts.push(current);
  return parts;
}

export function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatBigint(value: string): string {
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

export function buildGoQueryPath(name: string, args: string[]): string {
  const query = new URLSearchParams();
  for (const argument of args) query.append("args", argument);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/${encodeURIComponent(name)}${suffix}`;
}

export function safeRelativeTarget(target: string | null): string | undefined {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return undefined;
  return target;
}

export function retargetGoRequest(target: string, name: string): string | undefined {
  const safeTarget = safeRelativeTarget(target);
  if (!safeTarget) return undefined;

  const url = new URL(safeTarget, "http://go-router.invalid");
  if (url.pathname === "/") {
    const query = url.searchParams.get("q");
    const match = query?.match(/^\s*(?:"[^"]*"|'[^']*'|\S+)([\s\S]*)$/);
    if (!match) return undefined;
    url.searchParams.set("q", `${name}${match[1]}`);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const segments = url.pathname.split("/");
  if (!segments[1]) return undefined;
  segments[1] = encodeURIComponent(name);
  return `${segments.join("/")}${url.search}${url.hash}`;
}
