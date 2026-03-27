import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const dressIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase alphanumeric with dashes');

export const cronExpressionSchema = z
  .string()
  .regex(
    /^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(((\*|(\d+)([-/]\d+)?)(,(\*|(\d+)([-/]\d+)?))*)\s+){4}((\*|(\d+)([-/]\d+)?)(,(\*|(\d+)([-/]\d+)?))*)$/,
    'Must be a valid cron expression',
  )
  .or(z.string().startsWith('@'));

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+/, 'Must be a valid semver string');

// ---------------------------------------------------------------------------
// Param definition — describes a user-configurable parameter
// ---------------------------------------------------------------------------

export const paramDefSchema = z.object({
  description: z.string(),
  schema: z.instanceof(z.ZodType) as z.ZodType<z.ZodTypeAny>,
  default: z.unknown(),
});

// ---------------------------------------------------------------------------
// Secret definition
// ---------------------------------------------------------------------------

export const secretDefSchema = z.object({
  description: z.string(),
  url: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// Cron definition — a single scheduled job
// ---------------------------------------------------------------------------

export const cronDefSchema = z.object({
  id: dressIdSchema,
  name: z.string(),
  schedule: z.string(), // validated after param resolution
  skill: z.string(), // skill this cron triggers — must exist in requires.skills
});

// ---------------------------------------------------------------------------
// Memory contract
// ---------------------------------------------------------------------------

export const memoryContractSchema = z.object({
  dailySections: z.array(z.string()).default([]),
  reads: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Plugin definition — a required openclaw plugin
// ---------------------------------------------------------------------------

export const pluginDefSchema = z.object({
  id: z.string(),
  spec: z.string(),
  setupCommand: z.string().optional(),
  setupNotes: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Requires — dependencies on openclaw primitives and other dresses
// ---------------------------------------------------------------------------

export const requiresSchema = z.object({
  plugins: z.array(pluginDefSchema).default([]),
  skills: z.array(z.string()).default([]),
  dresses: z.record(z.string(), z.string()).default({}),
  optionalDresses: z.record(z.string(), z.string()).default({}),
});

// ---------------------------------------------------------------------------
// Files — assets bundled with the dress
// ---------------------------------------------------------------------------

export const dressFilesSchema = z.object({
  skills: z.record(z.string(), z.string()).default({}), // skill-name → path to SKILL.md
  templates: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Resolved dress — the full dress definition after param evaluation
// ---------------------------------------------------------------------------

export const resolvedDressSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
  requires: requiresSchema.default({}),
  secrets: z.record(z.string(), secretDefSchema).default({}),
  crons: z.array(cronDefSchema).default([]),
  memory: memoryContractSchema.default({}),
  heartbeat: z.array(z.string()).default([]),
  files: dressFilesSchema.default({}),
});

// ---------------------------------------------------------------------------
// State file — tracks what clawset has applied
// ---------------------------------------------------------------------------

export const appliedCronSchema = z.object({
  qualifiedId: z.string(),
  displayName: z.string(),
  skill: z.string().default(''),
});

export const appliedStateSchema = z.object({
  crons: z.array(appliedCronSchema).default([]),
  skills: z.array(z.string()).default([]),
  installedSkills: z.array(z.string()).default([]), // skills clawset actually installed (vs pre-existing)
  plugins: z.array(z.string()).default([]),
  installedPlugins: z.array(z.string()).default([]), // plugins clawset actually installed (vs pre-existing)
  memorySections: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  heartbeatEntries: z.array(z.string()).default([]),
});

export const dressEntrySchema = z.object({
  package: z.string(),
  version: semverSchema,
  installedAt: z.string().datetime(),
  params: z.record(z.string(), z.unknown()).default({}),
  applied: appliedStateSchema,
});

export const stateFileSchema = z.object({
  version: z.literal(1),
  serial: z.number().int().nonnegative(),
  openclawDir: z.string(),
  dresses: z.record(dressIdSchema, dressEntrySchema).default({}),
});

// ---------------------------------------------------------------------------
// Clawset config (lives at ~/.clawset/config.json)
// ---------------------------------------------------------------------------

export const clawsetConfigSchema = z.object({
  openclawDir: z.string(),
  version: z.string().default('0.1.0'),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DressId = z.infer<typeof dressIdSchema>;
export type AppliedCron = z.infer<typeof appliedCronSchema>;
export type CronDef = z.infer<typeof cronDefSchema>;
export type PluginDef = z.infer<typeof pluginDefSchema>;
export type MemoryContract = z.infer<typeof memoryContractSchema>;
export type Requires = z.infer<typeof requiresSchema>;
export type SecretDef = z.infer<typeof secretDefSchema>;
export type DressFiles = z.infer<typeof dressFilesSchema>;
export type ResolvedDress = z.infer<typeof resolvedDressSchema>;
export type AppliedState = z.infer<typeof appliedStateSchema>;
export type DressEntry = z.infer<typeof dressEntrySchema>;
export type StateFile = z.infer<typeof stateFileSchema>;
export type ClawsetConfig = z.infer<typeof clawsetConfigSchema>;

