// Old schemas (still used by merge.ts, dresscode.ts, state.ts, openclaw.ts)

// AGENTS.md reference injection
export { ensureDressesReference, INITIAL_DRESSES_MD } from '#core/agents-md.ts';
// Cron utilities
export { addHours, cronFromTime } from '#core/cron-utils.ts';
// DRESSCODE generation
export { generateDresscode } from '#core/dresscode.ts';
// Driver interface
export type {
  CronListEntry,
  OpenClawDriver,
  PluginConfigSchema,
  SessionListEntry,
} from '#core/driver.ts';
// Dependency graph
export { DependencyGraph } from '#core/graph.ts';
// Memory utilities
export { removeSection, wrapSection } from '#core/memory.ts';
export type { DesiredState, MergeConflict, StateDiff } from '#core/merge.ts';
// Merge and diff
export { diffState, mergeDresses } from '#core/merge.ts';
export type {
  AppliedCron,
  AppliedState,
  ClawtiqueConfig,
  CronDef,
  DressEntry,
  DressFiles,
  DressId,
  LingerieApplied,
  LingerieDef,
  LingerieEntry,
  PluginDef,
  Requires,
  ResolvedDress,
  SecretDef,
  StateFile,
} from '#core/schema.ts';
export {
  appliedCronSchema,
  appliedStateSchema,
  clawtiqueConfigSchema,
  cronDefSchema,
  cronExpressionSchema,
  dressEntrySchema,
  dressFilesSchema,
  dressIdSchema,
  lingerieAppliedSchema,
  lingerieDefSchema,
  lingerieEntrySchema,
  paramDefSchema,
  pluginDefSchema,
  requiresSchema,
  resolvedDressSchema,
  secretDefSchema,
  semverSchema,
  stateFileSchema,
} from '#core/schema.ts';
export type {
  ClawtiqueConfig as ClawtiqueConfigV2,
  CronJson,
  DressEntry as DressEntryV2,
  DressJson,
  LingerieEntry as LingerieEntryV2,
  LingerieJson,
  PersonalityEntry as PersonalityEntryV2,
  PersonalityFile,
  PersonalityJson,
  RegistryDressEntry,
  RegistryIndex,
  RegistryLingerieEntry,
  ResolvedPersonality,
  SkillJson,
  SkillParam,
  SkillTrigger,
  StateFile as StateFileV2,
  Weekday,
} from '#core/schemas/index.ts';
// New JSON-based schemas
export {
  cronJsonSchema,
  dressJsonSchema,
  lingerieJsonSchema,
  PERSONALITY_AUTO_VARS,
  PERSONALITY_FILES,
  personalityJsonSchema,
  registryIndexSchema,
  skillJsonSchema,
  skillParamSchema,
  skillTriggerSchema,
} from '#core/schemas/index.ts';
