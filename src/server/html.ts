import type { RouteSuggestion } from "../shared/schemas";
import type { TemplateArgument } from "../shared/template";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title: string, contents: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · go-router</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #f5f6f8; color: #172033; }
      main { max-width: 44rem; margin: 12vh auto; padding: 2.5rem; background: white; border: 1px solid #dce1e8; border-radius: 1rem; box-shadow: 0 12px 40px #17203310; }
      h1 { margin-top: 0; } a { color: #3157d5; } p { line-height: 1.6; }
      ul { padding-left: 1.25rem; } li { margin-block: .75rem; }
      .button { display: inline-block; padding: .7rem 1rem; border-radius: .5rem; color: white; background: #3157d5; text-decoration: none; font-weight: 650; }
      code { padding: .15rem .35rem; background: #eef1f5; border-radius: .25rem; }
      @media (prefers-color-scheme: dark) { body { background: #10131a; color: #f4f6fb; } main { background: #181d27; border-color: #2f3747; } code { background: #252c39; } }
    </style>
  </head>
  <body><main>${contents}</main></body>
</html>`;
}

function suggestionUrl(name: string, args: readonly TemplateArgument[]): string {
  const pathArguments = args.filter((argument) => argument.source === "path");
  const queryArguments = args.filter((argument) => argument.source === "query");
  let url = `/${encodeURIComponent(name)}`;
  if (pathArguments.length > 0) {
    url += `/${pathArguments.map((argument) => encodeURIComponent(argument.value)).join("/")}`;
  }
  if (queryArguments.length > 0) {
    const query = new URLSearchParams();
    for (const argument of queryArguments) query.append("args", argument.value);
    url += `?${query}`;
  }
  return url;
}

export function renderNotFoundPage(input: {
  name: string;
  args: readonly TemplateArgument[];
  returnTo: string;
  suggestions: readonly RouteSuggestion[];
}): string {
  const createQuery = new URLSearchParams({
    name: input.name,
    returnTo: input.returnTo,
    from: "suggestion",
  });
  for (const argument of input.args) createQuery.append("args", argument.value);
  const suggestions = input.suggestions.length
    ? `<h2>Did you mean?</h2><ul>${input.suggestions
        .map(
          (suggestion) =>
            `<li><a href="${escapeHtml(suggestionUrl(suggestion.name, input.args))}"><strong>go/${escapeHtml(suggestion.name)}</strong></a>${suggestion.description ? ` — ${escapeHtml(suggestion.description)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : "";

  return page(
    "Route not found",
    `<h1>We couldn’t find <code>go/${escapeHtml(input.name)}</code></h1>
     <p>No route or alias matches that name.</p>
     ${suggestions}
     <p><a class="button" href="/admin/new?${escapeHtml(createQuery.toString())}">Create and go</a></p>
     <p><a href="/admin/">Browse all routes</a></p>`,
  );
}

export function renderArgumentErrorPage(name: string, message: string): string {
  return page(
    "Route arguments could not be resolved",
    `<h1>Couldn’t open <code>go/${escapeHtml(name)}</code></h1>
     <p>${escapeHtml(message)}</p>
     <p><a href="/admin/">Open route manager</a></p>`,
  );
}
