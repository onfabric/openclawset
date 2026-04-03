import { z } from 'zod';
import { dressIdSchema, pluginDefSchema, semverSchema } from '#core/schemas/dress-json.ts';

// ---------------------------------------------------------------------------
// Config setup — static configs + interactive schema for plugin-less lingerie
// ---------------------------------------------------------------------------

export const configEntrySchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const configParamSchema = z.object({
  description: z.string().min(1),
  required: z.boolean().default(true),
  default: z.string().optional(),
});

export const configPropertySchema = z.object({
  description: z.string().min(1),
  required: z.boolean().default(true),
  default: z.string().optional(),
  params: z.array(z.string()).default([]),
  build: z.string().optional(),
});

export const configSetupSchema = z.object({
  configs: z.array(configEntrySchema).default([]),
  configPrefix: z.string().min(1).optional(),
  params: z.record(z.string(), configParamSchema).default({}),
  properties: z.record(z.string(), configPropertySchema).default({}),
});

// ---------------------------------------------------------------------------
// lingerie.json schema
// ---------------------------------------------------------------------------

export const lingerieJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
  plugins: z.array(pluginDefSchema).default([]),
  configSetup: configSetupSchema.optional(),
  skills: z.array(z.string()).default([]),
  /** Markdown injected into TOOLS.md on install, removed on uninstall. */
  toolsSection: z.string().optional(),
  /** Files copied to ~/.openclaw/workspace/resources/<lingerieId>/ on install. */
  resources: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type LingerieJson = z.infer<typeof lingerieJsonSchema>;
