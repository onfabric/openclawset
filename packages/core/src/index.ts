// Old schemas (still used by merge.ts, dresscode.ts, state.ts, openclaw.ts)

// Cron utilities
export { addHours, cronFromTime } from './cron-utils.js';
// DRESSCODE generation
export { generateDresscode } from './dresscode.js';
// Driver interface
export type { CronListEntry, OpenClawDriver, PluginConfigSchema } from './driver.js';
// Dependency graph
export { DependencyGraph } from './graph.js';
// Memory utilities
export {
  buildMemoryScaffold,
  extractSections,
  findDressMarkers,
  removeSection,
  stripMarkers,
  wrapSection,
} from './memory.js';
export type { DesiredState, MergeConflict, StateDiff } from './merge.js';
// Merge and diff
export { diffState, mergeDresses } from './merge.js';
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
  MemoryContract,
  PluginDef,
  Requires,
  ResolvedDress,
  SecretDef,
  StateFile,
} from './schema.js';
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
  memoryContractSchema,
  paramDefSchema,
  pluginDefSchema,
  requiresSchema,
  resolvedDressSchema,
  secretDefSchema,
  semverSchema,
  stateFileSchema,
} from './schema.js';
export type {
  ClawtiqueConfig as ClawtiqueConfigV2,
  CronJson,
  DressEntry as DressEntryV2,
  DressJson,
  LingerieEntry as LingerieEntryV2,
  LingerieJson,
  RegistryDressEntry,
  RegistryIndex,
  RegistryLingerieEntry,
  SkillJson,
  SkillParam,
  StateFile as StateFileV2,
  Weekday,
} from './schemas/index.js';
// New JSON-based schemas
export {
  cronJsonSchema,
  dressJsonSchema,
  lingerieJsonSchema,
  registryIndexSchema,
  skillJsonSchema,
  skillParamSchema,
} from './schemas/index.js';
