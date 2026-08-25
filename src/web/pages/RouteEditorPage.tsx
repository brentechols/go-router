import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CreateRouteInput, UpdateRouteInput } from "../../shared/schemas";
import { ApiError, createRoute, deleteRoute, getRoute, updateRoute } from "../api";
import { DeleteDialog } from "../components/DeleteDialog";
import { PageError, PageLoading } from "../components/Feedback";
import { RouteForm, type SaveIntent } from "../components/RouteForm";
import {
  buildGoQueryPath,
  parseSampleArguments,
  retargetGoRequest,
  safeRelativeTarget,
} from "../utils";

interface CreatePrefill {
  name: string;
  destinationTemplate: string;
  sampleArgs: string;
  args: string[];
  returnTo?: string;
  fromSuggestion: boolean;
}

function readCreatePrefill(searchParams: URLSearchParams): CreatePrefill {
  let name = searchParams.get("name")?.trim() ?? "";
  let args = searchParams.getAll("args").filter(Boolean);
  const wholeQuery = searchParams.get("q")?.trim();

  if (wholeQuery) {
    const tokens = parseSampleArguments(wholeQuery);
    if (!name) name = tokens.shift() ?? "";
    if (!args.length) args = tokens;
  }

  return {
    name,
    destinationTemplate: searchParams.get("destinationTemplate")?.trim() ?? "",
    sampleArgs: args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" "),
    args,
    returnTo: safeRelativeTarget(searchParams.get("returnTo")),
    fromSuggestion:
      searchParams.get("from") === "suggestion" ||
      searchParams.has("returnTo") ||
      searchParams.has("q"),
  };
}

function mutationMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "That name or one of its aliases is already in use. Try another shortcut.";
  }
  return error instanceof Error ? error.message : "The route could not be saved.";
}

export function RouteEditorPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saved, setSaved] = useState(searchParams.get("created") === "1");
  const prefill = useMemo(() => readCreatePrefill(searchParams), [searchParams]);

  const routeQuery = useQuery({
    queryKey: ["route", id],
    queryFn: () => getRoute(id!),
    enabled: mode === "edit" && Boolean(id),
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      input,
    }: {
      input: CreateRouteInput | UpdateRouteInput;
      intent: SaveIntent;
    }) => {
      if (mode === "edit") return updateRoute(id!, input as UpdateRouteInput);
      return createRoute(input as CreateRouteInput);
    },
    onSuccess: async (route, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.setQueryData(["route", route.id], route);

      if (variables.intent === "save-and-go") {
        const target =
          (prefill.returnTo && retargetGoRequest(prefill.returnTo, route.name)) ??
          buildGoQueryPath(route.name, prefill.args);
        window.location.assign(target);
        return;
      }

      if (mode === "create") {
        // React Router can preserve this component instance while switching
        // from the create route to the edit route, so initialize the banner
        // explicitly instead of relying only on the next URL's query string.
        setSaved(true);
        navigate(`/routes/${encodeURIComponent(route.id)}/edit?created=1`, { replace: true });
      } else {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 4000);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteRoute(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["routes"] });
      navigate("/", { replace: true });
    },
  });

  if (mode === "edit" && !id) {
    return (
      <PageError
        title="Route not found"
        error={new Error("No route ID was provided.")}
        action={
          <Link className="button button--secondary" to="/">
            Back to routes
          </Link>
        }
      />
    );
  }

  if (mode === "edit" && routeQuery.isPending) return <PageLoading label="Loading route" />;
  if (mode === "edit" && routeQuery.isError) {
    return (
      <PageError
        title={
          routeQuery.error instanceof ApiError && routeQuery.error.status === 404
            ? "Route not found"
            : "Route could not be loaded"
        }
        error={routeQuery.error}
        action={
          <Link className="button button--secondary" to="/">
            Back to routes
          </Link>
        }
      />
    );
  }

  const route = mode === "edit" ? routeQuery.data : undefined;

  return (
    <div className="editor-page">
      <div className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Routes</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{route ? `go/${route.name}` : "New route"}</span>
      </div>
      <header className="editor-header">
        <div>
          <p className="eyebrow">{route ? "Edit shortcut" : "New shortcut"}</p>
          <h1>{route ? `go/${route.name}` : "Create a route"}</h1>
          <p>
            {route
              ? "Changes apply immediately to the shortcut and all aliases."
              : "Give one useful destination a name your team will remember."}
          </p>
        </div>
        {route ? (
          <a
            className="button button--secondary"
            href={`/${encodeURIComponent(route.name)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open route <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </header>

      {prefill.fromSuggestion && !route ? (
        <div className="suggestion-banner" role="status">
          <span aria-hidden="true">✦</span>
          <div>
            <strong>That shortcut doesn’t exist yet.</strong>
            <p>Finish the destination, then save it for everyone or save and continue to it now.</p>
          </div>
        </div>
      ) : null}

      {saved ? (
        <div className="success-banner" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> Route saved. Your shortcut is ready to use.
        </div>
      ) : null}

      <RouteForm
        key={route?.updatedAt ?? "create"}
        route={route}
        defaults={{
          name: prefill.name,
          destinationTemplate: prefill.destinationTemplate,
          sampleArgs: prefill.sampleArgs,
        }}
        pending={saveMutation.isPending}
        error={saveMutation.isError ? mutationMessage(saveMutation.error) : undefined}
        saveAndGoAvailable={mode === "create" && prefill.fromSuggestion}
        onSubmit={async (input, intent) => {
          saveMutation.reset();
          try {
            await saveMutation.mutateAsync({ input, intent });
          } catch {
            // The mutation state renders the structured API error above the form.
          }
        }}
        onDelete={route ? () => setDeleteOpen(true) : undefined}
      />

      {route ? (
        <DeleteDialog
          open={deleteOpen}
          routeName={route.name}
          pending={removeMutation.isPending}
          error={removeMutation.isError ? mutationMessage(removeMutation.error) : undefined}
          onCancel={() => {
            if (!removeMutation.isPending) {
              removeMutation.reset();
              setDeleteOpen(false);
            }
          }}
          onConfirm={() => removeMutation.mutate()}
        />
      ) : null}
    </div>
  );
}
