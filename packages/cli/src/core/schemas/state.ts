import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const dressIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

// ---------------------------------------------------------------------------
// Applied cron — what was actually registered in openclaw
// ---------------------------------------------------------------------------

export const appliedCronSchema = z.object({
  qualifiedId: z.string(),
  displayName: z.string(),
  skill: z.string().default(''),
  channel: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Cron schedule — the user's scheduling choices
// ---------------------------------------------------------------------------

const cronScheduleSchema = z.object({
  time: z.string(),
  days: z.array(z.string()),
  channel: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Applied state — tracks everything clawtique has applied for a dress
// ---------------------------------------------------------------------------

export const appliedStateSchema = z.object({
  crons: z.array(appliedCronSchema).default([]),
  skills: z.array(z.string()).default([]),
  installedSkills: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
  installedPlugins: z.array(z.string()).default([]),
  memorySections: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  heartbeatSkills: z.array(z.string()).default([]),
  userSkills: z.array(z.string()).default([]),
  workspaceFiles: z.array(z.string()).default([]),
  lingerie: z.array(z.string()).default([]),
  dependsOnDresses: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Dress entry — a worn dress in state
// ---------------------------------------------------------------------------

export const dressEntrySchema = z.object({
  package: z.string(),
  version: z.string(),
  installedAt: z.string().datetime(),
  params: z.record(z.string(), z.unknown()).default({}),
  schedules: z.record(z.string(), cronScheduleSchema).default({}),
  applied: appliedStateSchema,
});

// ---------------------------------------------------------------------------
// Lingerie entry — installed lingerie in state
// ---------------------------------------------------------------------------

export const lingerieAppliedSchema = z.object({
  plugins: z.array(z.string()).default([]),
  installedPlugins: z.array(z.string()).default([]),
  configKeys: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  installedSkills: z.array(z.string()).default([]),
  toolsSectionInjected: z.boolean().default(false),
  installedResources: z.array(z.string()).default([]),
});

export const lingerieEntrySchema = z.object({
  package: z.string(),
  version: z.string(),
  installedAt: z.string().datetime(),
  applied: lingerieAppliedSchema,
});

// ---------------------------------------------------------------------------
// Personality entry — active personality in state
// ---------------------------------------------------------------------------

export const personalityEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  installedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// State file — the full ~/.clawtique/state.json
// ---------------------------------------------------------------------------

export const stateFileSchema = z.object({
  version: z.literal(1),
  serial: z.number().int().nonnegative(),
  openclawDir: z.string(),
  dresses: z.record(dressIdSchema, dressEntrySchema).default({}),
  lingerie: z.record(dressIdSchema, lingerieEntrySchema).default({}),
  personality: personalityEntrySchema.nullable().default(null),
});

// ---------------------------------------------------------------------------
// Config file — ~/.clawtique/config.json
// ---------------------------------------------------------------------------

export const clawtiqueConfigSchema = z.object({
  openclawDir: z.string(),
  timezone: z.string().default('UTC'),
  version: z.string().default('0.1.0'),
  user: z
    .object({
      name: z.string().min(1),
    })
    .default({ name: 'the user' }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AppliedCron = z.infer<typeof appliedCronSchema>;
export type AppliedState = z.infer<typeof appliedStateSchema>;
export type DressEntry = z.infer<typeof dressEntrySchema>;
export type LingerieApplied = z.infer<typeof lingerieAppliedSchema>;
export type LingerieEntry = z.infer<typeof lingerieEntrySchema>;
export type PersonalityEntry = z.infer<typeof personalityEntrySchema>;
export type StateFile = z.infer<typeof stateFileSchema>;
export type ClawtiqueConfig = z.infer<typeof clawtiqueConfigSchema>;
