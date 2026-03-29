import { z } from 'zod';
import { dressIdSchema, semverSchema } from '#core/schemas/dress-json.ts';

// ---------------------------------------------------------------------------
// The fixed set of personality files — always all written
// ---------------------------------------------------------------------------

export const PERSONALITY_FILES = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md'] as const;

export type PersonalityFile = (typeof PERSONALITY_FILES)[number];

/** Auto-vars available in personality .md files, injected from config at install time. */
export const PERSONALITY_AUTO_VARS = new Set(['user.name']);

// ---------------------------------------------------------------------------
// personality.json schema (manifest on disk — no inline file contents)
// ---------------------------------------------------------------------------

export const personalityJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** What lives on disk as personality.json */
export type PersonalityJson = z.infer<typeof personalityJsonSchema>;

/** Resolved at runtime — manifest + file contents read from .md files */
export type ResolvedPersonality = PersonalityJson & {
  files: Record<PersonalityFile, string>;
};
