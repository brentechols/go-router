# URL templates and arguments

Every destination must render to an absolute `http://` or `https://` URL. Templates are parsed and validated when a route is written, not for the first time during a redirect.

## Placeholders

`{*}` consumes one argument. Placeholders are filled from left to right, and the final placeholder captures all remaining arguments.

```text
https://github.com/{*}/issues/{*}
```

With arguments `openai`, `codex`, and `123`, this renders as:

```text
https://github.com/openai/issues/codex%20123
```

The final-rest separator depends on input. Consecutive path arguments join with `/`; query or browser-search arguments join with a space encoded as `%20`. A common repository shortcut is therefore:

```text
Template: https://github.com/{*}
Request:  /gh/openai/codex
Result:   https://github.com/openai/codex
```

## Optional blocks and defaults

Double braces delimit an optional block. The active side must contain exactly one `{*}` placeholder:

```text
https://example.com/search?q={*}{{&sort={*}}}
```

If a second argument exists, the whole block is emitted with the encoded value. If it does not, the block is omitted.

Add one `|` to provide literal fallback text:

```text
https://example.com/search?q={*}{{&sort={*}|&sort=relevance}}
```

Here the second argument selects a sort value; when absent, `&sort=relevance` is rendered. Fallback text is part of the trusted template and is not encoded.

Optional blocks cannot be nested, must contain exactly one placeholder on the active side, and may contain at most one fallback delimiter.

## Supplying arguments

### Path form

```text
GET /gh/openai/codex
```

Each path segment is an argument. This is the best form when slash structure should be preserved by a final placeholder.

### Repeated query form

```text
GET /search?args=fastify&args=zod
```

Repeated `args` values are treated as query arguments. Values captured by a final placeholder join with `%20`.

### Browser whole-query form

Configure a browser search shortcut with this URL, replacing the host:

```text
https://go.corp.example/?q=%s
```

Typing `go search fastify plugins` resolves `search` as the route and passes the remaining words as query arguments.

When path and repeated-query arguments are both present, path arguments come first. Unrelated query parameters are never forwarded automatically.

## Encoding and errors

Each user value is URL-component encoded exactly once. Characters such as `?`, `#`, `/`, and `%` cannot escape the component into which the template places them. Do not pre-encode inputs.

Templates are limited to 8,192 characters and 32 placeholders so validation and previews stay bounded.

Resolution fails with `422` when a required argument is absent or arguments are supplied to a template with no placeholders. A route write is rejected when braces are malformed, optional blocks are nested, or a representative rendering is not a valid HTTP(S) URL.
