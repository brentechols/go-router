export type TemplateErrorCode =
  "INVALID_TEMPLATE" | "INVALID_DESTINATION" | "MISSING_ARGUMENT" | "UNEXPECTED_ARGUMENT";

export class TemplateError extends Error {
  readonly code: TemplateErrorCode;
  readonly position?: number;

  constructor(code: TemplateErrorCode, message: string, position?: number) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
    this.position = position;
  }
}

export type TemplateArgument = {
  value: string;
  source: "path" | "query";
};

type TextNode = { type: "text"; value: string };
type PlaceholderNode = { type: "placeholder"; position: number; optional: boolean };
type OptionalNode = {
  type: "optional";
  active: Array<TextNode | PlaceholderNode>;
  fallback: string;
  position: number;
};

export type ParsedDestinationTemplate = {
  nodes: Array<TextNode | PlaceholderNode | OptionalNode>;
  placeholderCount: number;
};

export type TemplateValidationResult =
  | { valid: true; placeholderCount: number }
  | {
      valid: false;
      error: { code: TemplateErrorCode; message: string; position?: number };
    };

const MAX_TEMPLATE_LENGTH = 8_192;
const MAX_PLACEHOLDERS = 32;

function parseFragment(
  value: string,
  offset: number,
  optional: boolean,
): Array<TextNode | PlaceholderNode> {
  const nodes: Array<TextNode | PlaceholderNode> = [];
  let cursor = 0;

  while (cursor < value.length) {
    const marker = value.indexOf("{*}", cursor);
    const strayBrace = value.slice(cursor).search(/[{}]/);
    if (strayBrace >= 0 && (marker < 0 || cursor + strayBrace < marker)) {
      throw new TemplateError(
        "INVALID_TEMPLATE",
        "Only {*} placeholders and {{...}} optional blocks may contain braces.",
        offset + cursor + strayBrace,
      );
    }

    if (marker < 0) {
      if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
      break;
    }

    if (marker > cursor) nodes.push({ type: "text", value: value.slice(cursor, marker) });
    nodes.push({ type: "placeholder", position: offset + marker, optional });
    cursor = marker + 3;
  }

  return nodes;
}

function findOptionalEnd(template: string, start: number): number {
  let cursor = start + 2;
  while (cursor < template.length - 1) {
    if (template.startsWith("{*}", cursor)) {
      cursor += 3;
      continue;
    }
    if (template.startsWith("{{", cursor)) {
      throw new TemplateError(
        "INVALID_TEMPLATE",
        "Optional template blocks cannot be nested.",
        cursor,
      );
    }
    if (template.startsWith("}}", cursor)) return cursor;
    cursor += 1;
  }
  throw new TemplateError(
    "INVALID_TEMPLATE",
    "Optional template block is missing its closing }}.",
    start,
  );
}

function splitOptionalContent(content: string): [string, string] {
  let delimiter = -1;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|") {
      if (delimiter >= 0) {
        throw new TemplateError(
          "INVALID_TEMPLATE",
          "Optional template blocks may contain at most one fallback delimiter (|).",
        );
      }
      delimiter = index;
    }
  }
  return delimiter < 0
    ? [content, ""]
    : [content.slice(0, delimiter), content.slice(delimiter + 1)];
}

export function parseDestinationTemplate(template: string): ParsedDestinationTemplate {
  if (!template.trim()) {
    throw new TemplateError("INVALID_TEMPLATE", "Destination template is required.");
  }
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new TemplateError(
      "INVALID_TEMPLATE",
      `Destination templates cannot exceed ${MAX_TEMPLATE_LENGTH} characters.`,
    );
  }

  const nodes: ParsedDestinationTemplate["nodes"] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const optionalStart = template.indexOf("{{", cursor);
    const placeholderStart = template.indexOf("{*}", cursor);
    const next = [optionalStart, placeholderStart]
      .filter((position) => position >= 0)
      .sort((a, b) => a - b)[0];

    if (next === undefined) {
      const tail = template.slice(cursor);
      const stray = tail.search(/[{}]/);
      if (stray >= 0) {
        throw new TemplateError(
          "INVALID_TEMPLATE",
          "Only {*} placeholders and {{...}} optional blocks may contain braces.",
          cursor + stray,
        );
      }
      if (tail) nodes.push({ type: "text", value: tail });
      break;
    }

    if (next > cursor) {
      const text = template.slice(cursor, next);
      const stray = text.search(/[{}]/);
      if (stray >= 0) {
        throw new TemplateError(
          "INVALID_TEMPLATE",
          "Only {*} placeholders and {{...}} optional blocks may contain braces.",
          cursor + stray,
        );
      }
      nodes.push({ type: "text", value: text });
    }

    if (next === placeholderStart && (optionalStart < 0 || placeholderStart < optionalStart)) {
      nodes.push({ type: "placeholder", position: next, optional: false });
      cursor = next + 3;
      continue;
    }

    // The placeholder may be the first character of a triple-brace optional block.
    if (next === optionalStart) {
      const end = findOptionalEnd(template, next);
      const content = template.slice(next + 2, end);
      const [active, fallback] = splitOptionalContent(content);
      const activeNodes = parseFragment(active, next + 2, true);
      const placeholderCount = activeNodes.filter((node) => node.type === "placeholder").length;
      if (placeholderCount !== 1) {
        throw new TemplateError(
          "INVALID_TEMPLATE",
          "Each optional template block must contain exactly one {*} placeholder.",
          next,
        );
      }
      if (/[{}]/.test(fallback)) {
        throw new TemplateError("INVALID_TEMPLATE", "Fallback values cannot contain braces.", next);
      }
      nodes.push({ type: "optional", active: activeNodes, fallback, position: next });
      cursor = end + 2;
      continue;
    }
  }

  const placeholderCount = nodes.reduce((count, node) => {
    if (node.type === "placeholder") return count + 1;
    if (node.type === "optional") return count + 1;
    return count;
  }, 0);
  if (placeholderCount > MAX_PLACEHOLDERS) {
    throw new TemplateError(
      "INVALID_TEMPLATE",
      `Destination templates cannot contain more than ${MAX_PLACEHOLDERS} placeholders.`,
    );
  }
  return { nodes, placeholderCount };
}

function normalizeArguments(args: readonly (string | TemplateArgument)[]): TemplateArgument[] {
  return args.map((argument) =>
    typeof argument === "string" ? { value: argument, source: "query" } : argument,
  );
}

function encodeArgument(argument: TemplateArgument): string {
  return encodeURIComponent(argument.value);
}

function encodeRemaining(argumentsToJoin: readonly TemplateArgument[]): string {
  return argumentsToJoin.reduce((result, argument, index) => {
    if (index === 0) return encodeArgument(argument);
    const previous = argumentsToJoin[index - 1];
    const separator = previous.source === "path" && argument.source === "path" ? "/" : "%20";
    return `${result}${separator}${encodeArgument(argument)}`;
  }, "");
}

function hasAsciiWhitespaceOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function normalizeHttpUrl(value: string): string {
  if (hasAsciiWhitespaceOrControl(value)) {
    throw new TemplateError(
      "INVALID_DESTINATION",
      "The rendered destination cannot contain unencoded ASCII whitespace or control characters.",
    );
  }
  if (!/^https?:\/\//i.test(value) || value.includes("\\") || /%(?![0-9a-f]{2})/i.test(value)) {
    throw new TemplateError(
      "INVALID_DESTINATION",
      "The rendered destination must be a well-formed absolute HTTP or HTTPS URL.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TemplateError(
      "INVALID_DESTINATION",
      "The rendered destination must be an absolute HTTP or HTTPS URL.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TemplateError(
      "INVALID_DESTINATION",
      "The rendered destination must use HTTP or HTTPS.",
    );
  }
  // Preserve already-safe ASCII exactly (including encoded placeholder values).
  // WHATWG serialization only needs to make Unicode hosts/paths header-safe.
  return /^[\x20-\x7e]+$/.test(value) ? value : url.href;
}

function renderParsed(
  parsed: ParsedDestinationTemplate,
  args: readonly TemplateArgument[],
  validateOnly = false,
): string {
  let placeholderIndex = 0;

  const replacement = (optional: boolean): string | undefined => {
    const finalPlaceholder = placeholderIndex === parsed.placeholderCount - 1;
    const available = placeholderIndex < args.length;
    placeholderIndex += 1;

    if (!available) {
      if (optional) return undefined;
      throw new TemplateError(
        "MISSING_ARGUMENT",
        `Destination requires argument ${placeholderIndex}.`,
      );
    }

    return finalPlaceholder
      ? encodeRemaining(args.slice(placeholderIndex - 1))
      : encodeArgument(args[placeholderIndex - 1]);
  };

  let result = "";
  for (const node of parsed.nodes) {
    if (node.type === "text") {
      result += node.value;
      continue;
    }
    if (node.type === "placeholder") {
      result += replacement(false) ?? "";
      continue;
    }

    const value = replacement(true);
    if (value === undefined) {
      result += node.fallback;
      continue;
    }
    result += node.active
      .map((activeNode) => (activeNode.type === "text" ? activeNode.value : value))
      .join("");
  }

  if (!validateOnly && parsed.placeholderCount === 0 && args.length > 0) {
    throw new TemplateError("UNEXPECTED_ARGUMENT", "This route does not accept arguments.");
  }

  return normalizeHttpUrl(result);
}

export function renderDestinationTemplate(
  template: string,
  args: readonly (string | TemplateArgument)[] = [],
): string {
  return renderParsed(parseDestinationTemplate(template), normalizeArguments(args));
}

export function validateDestinationTemplate(template: string): TemplateValidationResult {
  try {
    const parsed = parseDestinationTemplate(template);
    const samples = Array.from({ length: parsed.placeholderCount }, () => ({
      value: "sample",
      source: "query" as const,
    }));
    // Every argument-count boundary selects a distinct reachable combination of
    // trailing optional/fallback branches. Missing-required variants cannot redirect
    // and are skipped; every successful rendering must still be a safe HTTP(S) URL.
    for (let argumentCount = 0; argumentCount <= parsed.placeholderCount; argumentCount += 1) {
      try {
        renderParsed(parsed, samples.slice(0, argumentCount), true);
      } catch (error) {
        if (error instanceof TemplateError && error.code === "MISSING_ARGUMENT") continue;
        throw error;
      }
    }
    return { valid: true, placeholderCount: parsed.placeholderCount };
  } catch (error) {
    const templateError =
      error instanceof TemplateError
        ? error
        : new TemplateError("INVALID_TEMPLATE", "Invalid destination template.");
    return {
      valid: false,
      error: {
        code: templateError.code,
        message: templateError.message,
        ...(templateError.position === undefined ? {} : { position: templateError.position }),
      },
    };
  }
}
