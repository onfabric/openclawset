import { z } from 'zod';

// ---------------------------------------------------------------------------
// registry.json schema — lightweight index for discovery
// ---------------------------------------------------------------------------

const registryDressEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  requires: z
    .object({
      lingerie: z.array(z.string()).default([]),
    })
    .default({ lingerie: [] }),
  path: z.string(),
});

const registryLingerieEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  path: z.string(),
});

const registryPersonalityEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  path: z.string(),
});

export const registryIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  dresses: z.record(z.string(), registryDressEntrySchema).default({}),
  lingerie: z.record(z.string(), registryLingerieEntrySchema).default({}),
  personalities: z.record(z.string(), registryPersonalityEntrySchema).default({}),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type RegistryIndex = z.infer<typeof registryIndexSchema>;
export type RegistryDressEntry = z.infer<typeof registryDressEntrySchema>;
export type RegistryLingerieEntry = z.infer<typeof registryLingerieEntrySchema>;
