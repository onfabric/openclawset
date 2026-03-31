import type {
  ClawtiqueConfig,
  DressJson,
  PersonalityFile,
  ResolvedDress,
  SkillTrigger,
  Weekday,
} from '#core/index.ts';
import { cronFromTime, PERSONALITY_FILES } from '#core/index.ts';

// ---------------------------------------------------------------------------
// Skill frontmatter parsing
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string;
  description: string;
}

/**
 * Parse YAML frontmatter from a skill .md file to extract name and description.
 * Returns undefined if the frontmatter is missing or incomplete.
 */
export function parseSkillMeta(content: string): SkillMeta | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const block = match[1]!;
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !description) return undefined;
  return { name, description };
}

// ---------------------------------------------------------------------------
// Types for user choices collected during prompting
// ---------------------------------------------------------------------------

export interface CronScheduleChoice {
  time: string; // HH:MM
  days: Weekday[];
  channel?: string;
}

export interface CompiledCron {
  id: string;
  dressId: string;
  name: string;
  schedule: string; // computed cron expression (UTC)
  skill: string;
  channel: string;
}

export interface CompiledDress {
  id: string;
  name: string;
  version: string;
  description: string;

  crons: CompiledCron[];
  bundledSkills: Map<string, string>; // skillId → compiled .md content
  clawHubSkills: string[]; // skill IDs to install from ClawHub
  skillTriggers: Record<string, SkillTrigger>; // skillId → trigger definition
  plugins: DressJson['requires']['plugins'];
  lingerie: string[];

  dailyMemorySection: string | undefined;
  workspace: string[];
  secrets: DressJson['secrets'];
}

export interface CompileInput {
  dress: DressJson;
  skillContents: Map<string, string>; // skillId → raw .md content
  cronSchedules: Record<string, CronScheduleChoice>; // cronId → user choices
  skillParams: Record<string, Record<string, unknown>>; // skillId → param values
  timezone: string;
}

// ---------------------------------------------------------------------------
// Auto-vars injected by the framework
// ---------------------------------------------------------------------------

const AUTO_VAR_PREFIXES = ['workspace.'];

export function buildAutoVars(dress: DressJson): Record<string, string> {
  const vars: Record<string, string> = {
    'dress.id': dress.id,
    'dress.name': dress.name,
    'memory.dailyMemorySection': dress.dailyMemorySection ?? '',
    'workspace.root': `~/.openclaw/workspace/dresses/${dress.id}`,
  };
  for (const wsPath of dress.workspace) {
    vars[`workspace.${wsPath}`] = `~/.openclaw/workspace/dresses/${dress.id}/${wsPath}`;
  }
  return vars;
}

function isAutoVar(name: string): boolean {
  const autoVarNames = new Set([
    'dress.id',
    'dress.name',
    'memory.dailyMemorySection',
    'workspace.root',
  ]);
  if (autoVarNames.has(name)) return true;
  return AUTO_VAR_PREFIXES.some((p) => name.startsWith(p));
}

// ---------------------------------------------------------------------------
// Placeholder extraction and injection
// ---------------------------------------------------------------------------

function extractPlaceholders(content: string): Set<string> {
  const matches = content.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return new Set();
  return new Set(matches.map((m) => m.slice(2, -2).trim()));
}

export function injectVars(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Validate that a dress.json is internally consistent. */
export function validateDress(
  dress: DressJson,
  skillContents: Map<string, string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build cron ID set for validation
  const cronIds = new Set(dress.crons.map((c) => c.id));
  // Track which crons have a skill bound to them
  const boundCrons = new Map<string, string>(); // cronId → skillId

  // Validate skill triggers
  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    const trigger = skillDef.trigger;
    if (trigger.type === 'cron') {
      if (!cronIds.has(trigger.cronId)) {
        errors.push(
          `Skill "${skillId}" has trigger.cronId "${trigger.cronId}" which does not match any cron`,
        );
      } else if (boundCrons.has(trigger.cronId)) {
        errors.push(
          `Cron "${trigger.cronId}" is bound to both "${boundCrons.get(trigger.cronId)}" and "${skillId}"`,
        );
      } else {
        boundCrons.set(trigger.cronId, skillId);
      }
    }
  }

  // Every cron must have exactly one skill bound to it
  for (const cron of dress.crons) {
    if (!boundCrons.has(cron.id)) {
      errors.push(`Cron "${cron.id}" has no skill with trigger.cronId pointing to it`);
    }
    if (
      cron.channel &&
      cron.channel !== 'last' &&
      !dress.requires.lingerie.includes(cron.channel)
    ) {
      errors.push(`Cron "${cron.id}" uses channel "${cron.channel}" not in requires.lingerie`);
    }
  }

  // Validate skill placeholders
  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    if (skillDef.source === 'clawhub') continue;

    const content = skillContents.get(skillId);
    if (!content) {
      errors.push(`Bundled skill "${skillId}" has no .md content`);
      continue;
    }

    const placeholders = extractPlaceholders(content);
    const declaredParams = new Set(Object.keys(skillDef.params));

    for (const placeholder of placeholders) {
      if (!declaredParams.has(placeholder) && !isAutoVar(placeholder)) {
        errors.push(`Skill "${skillId}": {{${placeholder}}} has no matching param or auto-var`);
      }
    }

    for (const param of declaredParams) {
      if (!placeholders.has(param)) {
        warnings.push(
          `Skill "${skillId}": param "${param}" is declared but never used as {{${param}}}`,
        );
      }
    }
  }

  // Validate that workspace paths referenced in skills point to declared workspace files
  const autoVars = buildAutoVars(dress);
  const workspaceRoot = autoVars['workspace.root']!;
  // Collect all resolved workspace file paths from auto-vars
  const declaredWorkspaceFiles = new Set(dress.workspace.map((p) => autoVars[`workspace.${p}`]!));

  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    if (skillDef.source === 'clawhub') continue;

    const content = skillContents.get(skillId);
    if (!content) continue;

    // Resolve auto-vars so we can see the actual paths
    const resolved = injectVars(content, autoVars);

    // Find all paths under workspace.root (backtick-wrapped or bare)
    const pathPattern = new RegExp(`${escapeRegExp(workspaceRoot)}/([\\w./-]+)`, 'g');
    for (const match of resolved.matchAll(pathPattern)) {
      const fullPath = match[0]!;
      if (!declaredWorkspaceFiles.has(fullPath)) {
        errors.push(
          `Skill "${skillId}": references "${fullPath}" but no matching entry in workspace array`,
        );
      }
    }
  }

  return { errors, warnings };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

/**
 * Compile a dress: takes the dress definition, skill file contents, and user
 * choices (cron schedules, skill param values, timezone) and produces a
 * CompiledDress ready to be applied to openclaw.
 */
export function compileDress(input: CompileInput): CompiledDress {
  const { dress, skillContents, cronSchedules, skillParams, timezone } = input;
  const autoVars = buildAutoVars(dress);

  // Build cronId → skillId mapping from skill triggers
  const cronToSkill = new Map<string, string>();
  const skillTriggers: Record<string, SkillTrigger> = {};
  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    skillTriggers[skillId] = skillDef.trigger;
    if (skillDef.trigger.type === 'cron') {
      cronToSkill.set(skillDef.trigger.cronId, skillId);
    }
  }

  // Compile crons
  const compiledCrons: CompiledCron[] = dress.crons.map((cron) => {
    const schedule = cronSchedules[cron.id];
    if (!schedule) {
      throw new Error(`No schedule provided for cron "${cron.id}"`);
    }
    const skill = cronToSkill.get(cron.id);
    if (!skill) {
      throw new Error(`No skill bound to cron "${cron.id}"`);
    }
    return {
      id: cron.id,
      dressId: dress.id,
      name: cron.name,
      schedule: cronFromTime(schedule.time, schedule.days, timezone),
      skill,
      channel: schedule.channel ?? 'last',
    };
  });

  // Compile bundled skills
  const bundledSkills = new Map<string, string>();
  const clawHubSkills: string[] = [];

  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    if (skillDef.source === 'clawhub') {
      clawHubSkills.push(skillId);
      continue;
    }

    const rawContent = skillContents.get(skillId);
    if (!rawContent) {
      throw new Error(`Missing content for bundled skill "${skillId}"`);
    }

    // Build injection vars: auto-vars + skill params
    const paramValues = skillParams[skillId] ?? {};
    const injectionVars: Record<string, string> = { ...autoVars };
    for (const [key, value] of Object.entries(paramValues)) {
      injectionVars[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    const compiled = injectVars(rawContent, injectionVars);

    // Check for unresolved placeholders
    const unresolved = compiled.match(/\{\{[^}]+\}\}/g);
    if (unresolved) {
      throw new Error(
        `Unresolved placeholders in skill "${skillId}": ${[...new Set(unresolved)].join(', ')}`,
      );
    }

    bundledSkills.set(skillId, compiled);
  }

  return {
    id: dress.id,
    name: dress.name,
    version: dress.version,
    description: dress.description,

    crons: compiledCrons,
    bundledSkills,
    clawHubSkills,
    skillTriggers,
    plugins: dress.requires.plugins,
    lingerie: dress.requires.lingerie,

    dailyMemorySection: dress.dailyMemorySection,
    workspace: dress.workspace,
    secrets: dress.secrets,
  };
}

// ---------------------------------------------------------------------------
// Personality compilation
// ---------------------------------------------------------------------------

export function buildPersonalityVars(config: ClawtiqueConfig): Record<string, string> {
  return {
    'user.name': config.user.name,
  };
}

/**
 * Compile personality files: inject config vars and validate that no
 * unresolved placeholders remain.
 */
export function compilePersonality(
  files: Record<PersonalityFile, string>,
  config: ClawtiqueConfig,
): Record<PersonalityFile, string> {
  const vars = buildPersonalityVars(config);
  const compiled = {} as Record<PersonalityFile, string>;

  for (const file of PERSONALITY_FILES) {
    const content = files[file] ?? '';
    const result = injectVars(content, vars);

    const unresolved = result.match(/\{\{[^}]+\}\}/g);
    if (unresolved) {
      throw new Error(`Unresolved placeholders in ${file}: ${[...new Set(unresolved)].join(', ')}`);
    }

    compiled[file] = result;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Convert CompiledDress → ResolvedDress (for merge checks and DRESSCODE generation)
// ---------------------------------------------------------------------------

export function compiledToResolved(compiled: CompiledDress): ResolvedDress {
  const allSkills = [...compiled.bundledSkills.keys(), ...compiled.clawHubSkills];
  return {
    id: compiled.id,
    name: compiled.name,
    version: compiled.version,
    description: compiled.description,
    requires: {
      plugins: compiled.plugins,
      skills: allSkills,
      dresses: {},
      optionalDresses: {},
      lingerie: compiled.lingerie,
    },
    secrets: compiled.secrets,
    crons: compiled.crons.map((c) => ({
      id: c.id,
      name: c.name,
      schedule: c.schedule,
      skill: c.skill,
      channel: c.channel === 'last' ? undefined : c.channel,
    })),
    dailyMemorySection: compiled.dailyMemorySection,
    files: { skills: {}, templates: [] },
    workspace: compiled.workspace,
  };
}
