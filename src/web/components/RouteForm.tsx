import { useMemo, useState, type BaseSyntheticEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  createRouteSchema,
  patchRouteSchema,
  type CreateRouteInput,
  type RouteRecord,
  type UpdateRouteInput,
} from "../../shared/schemas";
import { renderDestinationTemplate, validateDestinationTemplate } from "../../shared/template";
import { FieldError } from "./Feedback";
import { parseDelimitedValues, parseSampleArguments } from "../utils";

export type SaveIntent = "save" | "save-and-go";

interface RouteFormValues {
  name: string;
  aliases: string;
  destinationTemplate: string;
  description: string;
  tags: string;
  sampleArgs: string;
}

interface RouteFormProps {
  route?: RouteRecord;
  defaults?: Partial<RouteFormValues>;
  pending: boolean;
  error?: string;
  saveAndGoAvailable?: boolean;
  onSubmit: (input: CreateRouteInput | UpdateRouteInput, intent: SaveIntent) => Promise<void>;
  onDelete?: () => void;
}

function initialValues(
  route: RouteRecord | undefined,
  defaults: Partial<RouteFormValues>,
): RouteFormValues {
  return {
    name: route?.name ?? defaults.name ?? "",
    aliases: route?.aliases.join(", ") ?? defaults.aliases ?? "",
    destinationTemplate: route?.destinationTemplate ?? defaults.destinationTemplate ?? "",
    description: route?.description ?? defaults.description ?? "",
    tags: route?.tags.join(", ") ?? defaults.tags ?? "",
    sampleArgs: defaults.sampleArgs ?? "",
  };
}

export function RouteForm({
  route,
  defaults = {},
  pending,
  error,
  saveAndGoAvailable,
  onSubmit,
  onDelete,
}: RouteFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      route?.aliases.length ||
      route?.tags.length ||
      route?.description ||
      defaults.aliases ||
      defaults.tags,
    ),
  );
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty },
  } = useForm<RouteFormValues>({ defaultValues: initialValues(route, defaults) });

  const destinationTemplate = useWatch({ control, name: "destinationTemplate" });
  const sampleArgsText = useWatch({ control, name: "sampleArgs" });
  const routeName = useWatch({ control, name: "name" });

  const preview = useMemo(() => {
    if (!destinationTemplate.trim()) {
      return { kind: "idle" as const, message: "Enter a destination to see a preview." };
    }
    const validation = validateDestinationTemplate(destinationTemplate.trim());
    if (!validation.valid) {
      return { kind: "error" as const, message: validation.error.message };
    }
    try {
      const rendered = renderDestinationTemplate(
        destinationTemplate.trim(),
        parseSampleArguments(sampleArgsText),
      );
      return {
        kind: "success" as const,
        message: rendered,
        placeholderCount: validation.placeholderCount,
      };
    } catch (previewError) {
      return {
        kind: "waiting" as const,
        message:
          previewError instanceof Error
            ? previewError.message
            : "Add enough sample arguments to complete the preview.",
        placeholderCount: validation.placeholderCount,
      };
    }
  }, [destinationTemplate, sampleArgsText]);

  async function submit(values: RouteFormValues, event?: BaseSyntheticEvent) {
    const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
    const intent: SaveIntent =
      submitter instanceof HTMLButtonElement && submitter.value === "save-and-go"
        ? "save-and-go"
        : "save";

    const rawInput = {
      name: values.name.trim(),
      aliases: parseDelimitedValues(values.aliases),
      destinationTemplate: values.destinationTemplate.trim(),
      description: values.description.trim(),
      tags: parseDelimitedValues(values.tags),
    };
    const schema = route ? patchRouteSchema : createRouteSchema;
    const result = schema.safeParse(rawInput);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          field === "name" ||
          field === "aliases" ||
          field === "destinationTemplate" ||
          field === "description" ||
          field === "tags"
        ) {
          setError(field, { type: "validate", message: issue.message });
        } else {
          setError("aliases", { type: "validate", message: issue.message });
        }
      }
      return;
    }

    await onSubmit(result.data, intent);
  }

  return (
    <form className="route-form" onSubmit={handleSubmit(submit)} noValidate>
      {error ? (
        <div className="form-alert" role="alert">
          <strong>Couldn’t save this route.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <section className="form-card" aria-labelledby="shortcut-heading">
        <div className="form-card__number" aria-hidden="true">
          1
        </div>
        <div className="form-card__content">
          <div className="form-card__heading">
            <div>
              <h2 id="shortcut-heading">Choose a shortcut</h2>
              <p>Keep it brief, recognizable, and easy to type.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="route-name">Route name</label>
            <div className={`prefixed-input ${errors.name ? "prefixed-input--error" : ""}`}>
              <span aria-hidden="true">go/</span>
              <input
                id="route-name"
                autoComplete="off"
                autoFocus={!route}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "route-name-error" : "route-name-help"}
                placeholder="design-system"
                {...register("name", { required: "Choose a route name." })}
              />
            </div>
            <span id="route-name-help" className="field-help">
              Lowercase letters, numbers, hyphens, and underscores; up to 64 characters.
            </span>
            <span id="route-name-error">
              <FieldError message={errors.name?.message} />
            </span>
          </div>
        </div>
      </section>

      <section className="form-card" aria-labelledby="destination-heading">
        <div className="form-card__number" aria-hidden="true">
          2
        </div>
        <div className="form-card__content">
          <div className="form-card__heading">
            <div>
              <h2 id="destination-heading">Set the destination</h2>
              <p>
                Use <code>{"{*}"}</code> for required arguments and <code>{"{{...}}"}</code> for
                optional parts.
              </p>
            </div>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="text-link">
              Template reference <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <div className="field">
            <label htmlFor="destination-template">Destination template</label>
            <input
              id="destination-template"
              className="code-input"
              type="url"
              spellCheck={false}
              aria-invalid={Boolean(errors.destinationTemplate) || preview.kind === "error"}
              aria-describedby="destination-help destination-error"
              placeholder="https://example.com/projects/{*}"
              {...register("destinationTemplate", { required: "Enter a destination URL." })}
            />
            <span id="destination-help" className="field-help">
              Only <code>https://</code> and <code>http://</code> URLs are accepted.
            </span>
            <span id="destination-error">
              <FieldError
                message={
                  errors.destinationTemplate?.message ??
                  (preview.kind === "error" ? preview.message : undefined)
                }
              />
            </span>
          </div>

          <div className="preview-panel">
            <div className="preview-panel__heading">
              <label htmlFor="sample-args">Try it</label>
              {"placeholderCount" in preview && (preview.placeholderCount ?? 0) > 0 ? (
                <span>
                  {preview.placeholderCount} variable{" "}
                  {preview.placeholderCount === 1 ? "slot" : "slots"}
                </span>
              ) : null}
            </div>
            <div className="try-input">
              <span aria-hidden="true">go/</span>
              <strong>{routeName || "shortcut"}</strong>
              <input
                id="sample-args"
                placeholder="sample arguments"
                autoComplete="off"
                {...register("sampleArgs")}
              />
            </div>
            <div
              className={`preview-result preview-result--${preview.kind}`}
              aria-live="polite"
              aria-label="Destination preview"
            >
              <span aria-hidden="true">{preview.kind === "success" ? "→" : "·"}</span>
              {preview.kind === "success" ? (
                <code>{preview.message}</code>
              ) : (
                <span>{preview.message}</span>
              )}
            </div>
            <p className="field-help">Wrap sample values containing spaces in quotes.</p>
          </div>
        </div>
      </section>

      <section className="form-card" aria-labelledby="details-heading">
        <div className="form-card__number" aria-hidden="true">
          3
        </div>
        <div className="form-card__content">
          <div className="form-card__heading form-card__heading--toggle">
            <div>
              <h2 id="details-heading">Help people find it</h2>
              <p>Add context, aliases, and tags when they’re useful.</p>
            </div>
            <button
              type="button"
              className="button button--quiet button--small"
              aria-expanded={showAdvanced}
              aria-controls="route-details"
              onClick={() => setShowAdvanced((visible) => !visible)}
            >
              {showAdvanced ? "Hide details" : "Add details"}
            </button>
          </div>
          <div id="route-details" hidden={!showAdvanced} className="details-grid">
            <div className="field field--wide">
              <label htmlFor="route-description">Description</label>
              <textarea
                id="route-description"
                rows={3}
                placeholder="What does this route open?"
                aria-invalid={Boolean(errors.description)}
                {...register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
            <div className="field">
              <label htmlFor="route-aliases">Aliases</label>
              <input
                id="route-aliases"
                placeholder="figma, components"
                aria-invalid={Boolean(errors.aliases)}
                {...register("aliases")}
              />
              <span className="field-help">Comma-separated alternate shortcuts.</span>
              <FieldError message={errors.aliases?.message} />
            </div>
            <div className="field">
              <label htmlFor="route-tags">Tags</label>
              <input
                id="route-tags"
                placeholder="design, tools"
                aria-invalid={Boolean(errors.tags)}
                {...register("tags")}
              />
              <span className="field-help">Comma-separated labels for filtering.</span>
              <FieldError message={errors.tags?.message} />
            </div>
          </div>
        </div>
      </section>

      <div className="form-actions">
        <div>
          {onDelete ? (
            <button className="button button--danger-quiet" type="button" onClick={onDelete}>
              Delete route
            </button>
          ) : null}
        </div>
        <div className="form-actions__primary">
          <Link className="button button--ghost" to="/">
            Cancel
          </Link>
          {saveAndGoAvailable ? (
            <button
              className="button button--secondary"
              type="submit"
              name="intent"
              value="save-and-go"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save & go"}
            </button>
          ) : null}
          <button
            className="button button--primary"
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
          >
            {pending ? "Saving…" : route ? "Save changes" : "Create route"}
          </button>
        </div>
      </div>
      {isDirty ? (
        <span className="sr-only" aria-live="polite">
          Form has unsaved changes.
        </span>
      ) : null}
    </form>
  );
}
