import { z } from 'zod';
import { dressIdSchema, pluginDefSchema, semverSchema } from '#core/schemas/dress-json.ts';

// ---------------------------------------------------------------------------
// lingerie.json schema
// ---------------------------------------------------------------------------

export const lingerieJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
  plugins: z.array(pluginDefSchema).default([]),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type LingerieJson = z.infer<typeof lingerieJsonSchema>;
