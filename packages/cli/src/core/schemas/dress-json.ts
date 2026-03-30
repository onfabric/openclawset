import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const dressIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase alphanumeric with dashes');

export const semverSchema = z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a valid semver string');

const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const pluginDefSchema = z.object({
  id: z.string(),
  spec: z.string(),
  setupCommand: z.string().optional(),
  setupNotes: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Requires — dependencies
// ---------------------------------------------------------------------------

export const requiresSchema = z
  .object({
    lingerie: z.array(z.string()).default([]),
    plugins: z.array(pluginDefSchema).default([]),
    dresses: z.record(z.string(), z.string()).default({}),
    optionalDresses: z.record(z.string(), z.string()).default({}),
  })
  .default({ lingerie: [], plugins: [], dresses: {}, optionalDresses: {} });

// ---------------------------------------------------------------------------
// Cron defaults — scheduling hints, not actual cron expressions
// ---------------------------------------------------------------------------

const cronDefaultsSchema = z
  .object({
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Use HH:MM format')
      .optional(),
    days: z.array(weekdaySchema).optional(),
  })
  .default({});

// ---------------------------------------------------------------------------
// Cron definition (pure schedule — skill binding lives in the skill's trigger)
// ---------------------------------------------------------------------------

export const cronJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string(),
  channel: z.string().optional(),
  defaults: cronDefaultsSchema,
});

// ---------------------------------------------------------------------------
// Skill param definition
// ---------------------------------------------------------------------------

const paramTypeSchema = z.enum(['string', 'number', 'string[]']);

export const skillParamSchema = z
  .object({
    description: z.string(),
    type: paramTypeSchema,
    default: z.unknown(),
  })
  .refine(
    (p) => {
      switch (p.type) {
        case 'string':
          return typeof p.default === 'string';
        case 'number':
          return typeof p.default === 'number';
        case 'string[]':
          return Array.isArray(p.default) && p.default.every((v: unknown) => typeof v === 'string');
        default:
          return false;
      }
    },
    { message: 'Default value must match declared type' },
  );

// ---------------------------------------------------------------------------
// Skill trigger — determines when and how a skill is activated
// ---------------------------------------------------------------------------

const cronTriggerSchema = z.object({
  type: z.literal('cron'),
  cronId: dressIdSchema,
});

const userTriggerSchema = z.object({
  type: z.literal('user'),
  description: z.string().min(1, 'User-triggered skills must have a description'),
});

const heartbeatTriggerSchema = z.object({
  type: z.literal('heartbeat'),
  description: z.string().min(1, 'Heartbeat-triggered skills must have a description'),
});

export const skillTriggerSchema = z.discriminatedUnion('type', [
  cronTriggerSchema,
  userTriggerSchema,
  heartbeatTriggerSchema,
]);

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

export const skillJsonSchema = z.object({
  source: z.enum(['bundled', 'clawhub']).default('bundled'),
  trigger: skillTriggerSchema,
  params: z.record(z.string(), skillParamSchema).default({}),
});

// ---------------------------------------------------------------------------
// Secret definition
// ---------------------------------------------------------------------------

export const secretDefSchema = z.object({
  description: z.string(),
  url: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// Full dress.json schema
// ---------------------------------------------------------------------------

export const dressJsonSchema = z.object({
  id: dressIdSchema,
  name: z.string().min(1),
  version: semverSchema,
  description: z.string().default(''),

  requires: requiresSchema,

  crons: z.array(cronJsonSchema).default([]),
  skills: z.record(z.string(), skillJsonSchema).default({}),
  secrets: z.record(z.string(), secretDefSchema).default({}),

  dailyMemorySection: z.string().optional(),
  workspace: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DressJson = z.infer<typeof dressJsonSchema>;
export type CronJson = z.infer<typeof cronJsonSchema>;
export type SkillJson = z.infer<typeof skillJsonSchema>;
export type SkillTrigger = z.infer<typeof skillTriggerSchema>;
export type SkillParam = z.infer<typeof skillParamSchema>;
export type PluginDef = z.infer<typeof pluginDefSchema>;
export type Requires = z.infer<typeof requiresSchema>;
export type SecretDef = z.infer<typeof secretDefSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
