import { z } from 'zod';
import { dressIdSchema, pluginDefSchema, semverSchema } from '#core/schemas/dress-json.ts';

// ---------------------------------------------------------------------------
// Config setup — prompts + config entries for plugin-less lingerie
// ---------------------------------------------------------------------------

export const configPromptSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
  default: z.string().optional(),
});

export const configEntrySchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const configSetupSchema = z.object({
  prompts: z.array(configPromptSchema).default([]),
  configs: z.array(configEntrySchema).default([]),
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
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type LingerieJson = z.infer<typeof lingerieJsonSchema>;
