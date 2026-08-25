import { useQuery } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listRoutes, type RouteSort, type SortOrder } from "../api";
import { PageError, PageLoading } from "../components/Feedback";
import { formatBigint, formatDate, parseDelimitedValues, pluralize } from "../utils";

const SORT_OPTIONS: Array<{ value: RouteSort; label: string }> = [
  { value: "name", label: "Name" },
  { value: "updatedAt", label: "Recently updated" },
  { value: "createdAt", label: "Recently created" },
  { value: "lastUsedAt", label: "Recently used" },
  { value: "hitCount", label: "Most used" },
];

function isRouteSort(value: string | null): value is RouteSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function RouteSkeletons() {
  return (
    <div className="route-skeletons" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="route-skeleton" key={index} />
      ))}
    </div>
  );
}

export function RouteListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  const tagsText = searchParams.get("tags")?.trim() ?? "";
  const tags = parseDelimitedValues(tagsText);
  const cursor = searchParams.get("cursor") ?? undefined;
  const sortValue = searchParams.get("sort");
  const sort: RouteSort = isRouteSort(sortValue) ? sortValue : "name";
  const orderValue = searchParams.get("order");
  const order: SortOrder =
    orderValue === "asc" || orderValue === "desc" ? orderValue : sort === "name" ? "asc" : "desc";

  const routesQuery = useQuery({
    queryKey: ["routes", { q, tags: tags.join(","), cursor, sort, order }],
    queryFn: () => listRoutes({ q, tags, cursor, sort, order, limit: 50 }),
    placeholderData: (previous) => previous,
  });

  function replaceParams(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    replaceParams({
      q: String(data.get("q") ?? "").trim() || undefined,
      tags: String(data.get("tags") ?? "").trim() || undefined,
      cursor: undefined,
    });
  }

  const data = routesQuery.data;
  const total = Number(data?.page.total ?? 0);
  const filtering = Boolean(q || tags.length);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Route directory</p>
          <h1>Everywhere your team goes.</h1>
          <p className="hero__lede">
            Turn long, forgettable URLs into shortcuts anyone can remember.
          </p>
        </div>
        <div className="hero__stat" aria-live="polite">
          <strong>{routesQuery.isPending ? "—" : total.toLocaleString()}</strong>
          <span>{pluralize(total, "route")}</span>
        </div>
      </section>

      <section className="directory" aria-labelledby="route-directory-title">
        <div className="directory__heading">
          <div>
            <h2 id="route-directory-title">Routes</h2>
            <p>Find a shortcut or make a new one.</p>
          </div>
          <Link className="button button--primary directory__new" to="/new">
            <span aria-hidden="true">＋</span> New route
          </Link>
        </div>

        <form className="filter-bar" onSubmit={submitFilters} key={`${q}|${tagsText}`}>
          <div className="search-field">
            <label className="sr-only" htmlFor="route-search">
              Search routes
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="route-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search names, destinations, or descriptions"
            />
          </div>
          <div className="tag-filter">
            <label className="sr-only" htmlFor="tag-filter">
              Filter by comma-separated tags
            </label>
            <input
              id="tag-filter"
              name="tags"
              defaultValue={tagsText}
              placeholder="Tags (design, docs)"
            />
          </div>
          <button className="button button--secondary" type="submit">
            Filter
          </button>
          {filtering ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={() =>
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.delete("q");
                  next.delete("tags");
                  next.delete("cursor");
                  return next;
                })
              }
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="sort-bar">
          <span className="sort-bar__result" aria-live="polite">
            {routesQuery.isFetching && !routesQuery.isPending
              ? "Refreshing…"
              : `${total.toLocaleString()} ${pluralize(total, "result")}`}
          </span>
          <div className="sort-controls">
            <label htmlFor="route-sort">Sort by</label>
            <select
              id="route-sort"
              value={sort}
              onChange={(event) => {
                const nextSort = event.target.value as RouteSort;
                replaceParams({
                  sort: nextSort,
                  order: nextSort === "name" ? "asc" : "desc",
                  cursor: undefined,
                });
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              type="button"
              onClick={() =>
                replaceParams({ order: order === "asc" ? "desc" : "asc", cursor: undefined })
              }
              aria-label={`Sort ${order === "asc" ? "descending" : "ascending"}`}
              title={`Currently ${order === "asc" ? "ascending" : "descending"}`}
            >
              {order === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {routesQuery.isPending ? (
          <>
            <PageLoading />
            <RouteSkeletons />
          </>
        ) : routesQuery.isError ? (
          <PageError
            title="Routes could not be loaded"
            error={routesQuery.error}
            action={
              <button
                className="button button--secondary button--small"
                onClick={() => routesQuery.refetch()}
              >
                Try again
              </button>
            }
          />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="route-table-wrap">
              <table className="route-table">
                <thead>
                  <tr>
                    <th scope="col">Shortcut</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Usage</th>
                    <th scope="col">Last used</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((route) => (
                    <tr key={route.id}>
                      <td data-label="Shortcut">
                        <div className="route-name-cell">
                          <a
                            className="go-link"
                            href={`/${encodeURIComponent(route.name)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span>go/</span>
                            {route.name}
                            <span className="sr-only"> (opens route in a new tab)</span>
                          </a>
                          {route.description ? <p>{route.description}</p> : null}
                          <div className="badge-row">
                            {route.aliases.map((alias) => (
                              <span className="badge badge--alias" key={alias}>
                                go/{alias}
                              </span>
                            ))}
                            {route.tags.map((tag) => (
                              <button
                                type="button"
                                className="badge badge--tag"
                                key={tag}
                                onClick={() => replaceParams({ tags: tag, cursor: undefined })}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td data-label="Destination">
                        <code className="destination" title={route.destinationTemplate}>
                          {route.destinationTemplate}
                        </code>
                      </td>
                      <td data-label="Usage">
                        <strong className="usage-count">{formatBigint(route.hitCount)}</strong>
                        <span className="mobile-only"> hits</span>
                      </td>
                      <td data-label="Last used">
                        <span className="muted">{formatDate(route.lastUsedAt)}</span>
                      </td>
                      <td className="route-actions">
                        <Link
                          className="button button--ghost button--small"
                          to={`/routes/${encodeURIComponent(route.id)}/edit`}
                          aria-label={`Edit go/${route.name}`}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Route pages">
              <button
                className="button button--ghost"
                type="button"
                disabled={!data.page.previousCursor || routesQuery.isFetching}
                onClick={() => replaceParams({ cursor: data.page.previousCursor ?? undefined })}
              >
                ← Previous
              </button>
              <span>Showing up to {data.page.limit} routes</span>
              <button
                className="button button--ghost"
                type="button"
                disabled={!data.page.nextCursor || routesQuery.isFetching}
                onClick={() => replaceParams({ cursor: data.page.nextCursor ?? undefined })}
              >
                Next →
              </button>
            </nav>
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-state__art" aria-hidden="true">
              ↗
            </span>
            <h3>{filtering ? "No matching routes" : "Create your first shortcut"}</h3>
            <p>
              {filtering
                ? "Try a broader search, remove a tag, or create the route you expected to find."
                : "Start with a destination your team visits every day."}
            </p>
            {filtering ? (
              <button className="button button--secondary" onClick={() => setSearchParams({})}>
                Clear filters
              </button>
            ) : (
              <Link className="button button--primary" to="/new">
                Create a route
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
