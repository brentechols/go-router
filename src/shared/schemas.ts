import { z } from "zod";

import { validateName } from "./names";
import { validateDestinationTemplate } from "./template";

const nameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .superRefine((value, context) => {
    const result = validateName(value);
    if (!result.valid) context.addIssue({ code: "custom", message: result.message });
  });

const destinationTemplateSchema = z.string().superRefine((value, context) => {
  const result = validateDestinationTemplate(value);
  if (!result.valid) context.addIssue({ code: "custom", message: result.error.message });
});

const tagsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(32)
  .default([])
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

const aliasesSchema = z
  .array(nameSchema)
  .max(32)
  .superRefine((aliases, context) => {
    const normalized = aliases.map((alias) => alias.replace(/[-_]/g, ""));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Aliases must be unique." });
    }
  });

export const createRouteSchema = z
  .object({
    name: nameSchema,
    aliases: aliasesSchema.default([]),
    destinationTemplate: destinationTemplateSchema,
    description: z.string().trim().max(2_000).default(""),
    tags: tagsSchema,
  })
  .superRefine((value, context) => {
    const names = [value.name, ...value.aliases];
    const normalized = names.map((name) => name.replace(/[-_]/g, ""));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Canonical name and aliases must be unique." });
    }
  });

export const patchRouteSchema = z
  .object({
    name: nameSchema.optional(),
    aliases: aliasesSchema.optional(),
    destinationTemplate: destinationTemplateSchema.optional(),
    description: z.string().trim().max(2_000).optional(),
    tags: tagsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied.",
  });

export const upsertRouteSchema = z.object({
  aliases: aliasesSchema.optional(),
  destinationTemplate: destinationTemplateSchema,
  description: z.string().trim().max(2_000).optional(),
  tags: tagsSchema.optional(),
});

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  destinationTemplate: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  hitCount: z.string(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const routeSortSchema = z.enum(["name", "createdAt", "updatedAt", "hitCount", "lastUsedAt"]);
export const sortOrderSchema = z.enum(["asc", "desc"]);

export const routeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
  q: z.string().trim().max(256).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  sort: routeSortSchema.default("name"),
  order: sortOrderSchema.default("asc"),
});

export const routeListResponseSchema = z.object({
  items: z.array(routeSchema),
  page: z.object({
    limit: z.number().int(),
    total: z.number().int(),
    nextCursor: z.string().nullable(),
    previousCursor: z.string().nullable(),
  }),
});

export const routeSuggestionSchema = z.object({
  id: z.string(),
  name: z.string(),
  destinationTemplate: z.string(),
  description: z.string(),
  score: z.number(),
});

export const suggestionsResponseSchema = z.object({
  items: z.array(routeSuggestionSchema),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type UpdateRouteInput = z.infer<typeof patchRouteSchema>;
export type UpsertRouteInput = z.infer<typeof upsertRouteSchema>;
export type RouteRecord = z.infer<typeof routeSchema>;
export type RouteListQuery = z.infer<typeof routeListQuerySchema>;
export type RouteListResponse = z.infer<typeof routeListResponseSchema>;
export type RouteSuggestion = z.infer<typeof routeSuggestionSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
