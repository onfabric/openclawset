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

export const semverSchema = z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a valid semver string');

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
  skill: z.string(), // derived from the skill whose trigger.cronId matches this cron
  channel: z.string().optional(), // channel to announce on — must match an active lingerie ID; omit for 'last'
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
  lingerie: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Files — assets bundled with the dress
// ---------------------------------------------------------------------------

export const skillFileDefSchema = z.union([
  z.string(), // plain path to SKILL.md
  z.object({
    path: z.string(),
    vars: z.record(z.string(), z.string()).default({}),
  }),
]);

export const dressFilesSchema = z.object({
  skills: z.record(z.string(), skillFileDefSchema).default({}),
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
  requires: requiresSchema.default({
    plugins: [],
    skills: [],
    dresses: {},
    optionalDresses: {},
    lingerie: [],
  }),
  secrets: z.record(z.string(), secretDefSchema).default({}),
  crons: z.array(cronDefSchema).default([]),
  dailyMemorySection: z.string().optional(),
  files: dressFilesSchema.default({ skills: {}, templates: [] }),
  // Workspace files: paths relative to workspace dir
  // Created on dress if missing, preserved on undress (user data)
  workspace: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Lingerie — shared plugin infrastructure
// ---------------------------------------------------------------------------

export const lingerieDefSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),
  plugins: z.array(pluginDefSchema).default([]),
});

export const lingerieAppliedSchema = z.object({
  plugins: z.array(z.string()).default([]),
  installedPlugins: z.array(z.string()).default([]),
});

export const lingerieEntrySchema = z.object({
  package: z.string(),
  version: semverSchema,
  installedAt: z.string().datetime(),
  applied: lingerieAppliedSchema,
});

// ---------------------------------------------------------------------------
// State file — tracks what clawtique has applied
// ---------------------------------------------------------------------------

export const appliedCronSchema = z.object({
  qualifiedId: z.string(),
  displayName: z.string(),
  skill: z.string().default(''),
  channel: z.string().optional(),
});

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
  lingerie: z.array(z.string()).default([]), // lingerie IDs this dress depends on
  dependsOnDresses: z.array(z.string()).default([]), // dress IDs this dress depends on
});

export const cronScheduleSchema = z.object({
  time: z.string(),
  days: z.array(z.string()),
  channel: z.string().optional(),
});

export const dressEntrySchema = z.object({
  package: z.string(),
  version: semverSchema,
  installedAt: z.string().datetime(),
  params: z.record(z.string(), z.unknown()).default({}),
  schedules: z.record(z.string(), cronScheduleSchema).default({}),
  applied: appliedStateSchema,
});

const personalityEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  installedAt: z.string().datetime(),
});

export const stateFileSchema = z.object({
  version: z.literal(1),
  serial: z.number().int().nonnegative(),
  openclawDir: z.string(),
  dresses: z.record(dressIdSchema, dressEntrySchema).default({}),
  lingerie: z.record(dressIdSchema, lingerieEntrySchema).default({}),
  personality: personalityEntrySchema.nullable().default(null),
});

// ---------------------------------------------------------------------------
// Clawtique config (lives at ~/.clawtique/config.json)
// ---------------------------------------------------------------------------

export const clawtiqueConfigSchema = z.object({
  openclawDir: z.string(),
  timezone: z.string().default('UTC'),
  version: z.string().default('0.1.0'),
  user: z.object({
    name: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DressId = z.infer<typeof dressIdSchema>;
export type AppliedCron = z.infer<typeof appliedCronSchema>;
export type CronDef = z.infer<typeof cronDefSchema>;
export type PluginDef = z.infer<typeof pluginDefSchema>;
export type SkillFileDef = z.infer<typeof skillFileDefSchema>;
export type Requires = z.infer<typeof requiresSchema>;
export type SecretDef = z.infer<typeof secretDefSchema>;
export type DressFiles = z.infer<typeof dressFilesSchema>;
export type ResolvedDress = z.infer<typeof resolvedDressSchema>;
export type AppliedState = z.infer<typeof appliedStateSchema>;
export type DressEntry = z.infer<typeof dressEntrySchema>;
export type LingerieDef = z.infer<typeof lingerieDefSchema>;
export type LingerieApplied = z.infer<typeof lingerieAppliedSchema>;
export type LingerieEntry = z.infer<typeof lingerieEntrySchema>;
export type StateFile = z.infer<typeof stateFileSchema>;
export type ClawtiqueConfig = z.infer<typeof clawtiqueConfigSchema>;
