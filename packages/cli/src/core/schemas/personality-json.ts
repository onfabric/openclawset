import { z } from 'zod';
import { dressIdSchema, semverSchema } from '#core/schemas/dress-json.ts';

// ---------------------------------------------------------------------------
// The fixed set of personality files — always all written
// ---------------------------------------------------------------------------

export const PERSONALITY_FILES = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md'] as const;

// ---------------------------------------------------------------------------
// personality.json schema
// ---------------------------------------------------------------------------

export const personalityJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
  files: z.record(z.enum(PERSONALITY_FILES), z.string()),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PersonalityJson = z.infer<typeof personalityJsonSchema>;
