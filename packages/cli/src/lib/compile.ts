import type { DressJson, Weekday } from '#core/index.ts';
import { cronFromTime } from '#core/index.ts';

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
  plugins: DressJson['requires']['plugins'];
  lingerie: string[];

  memory: DressJson['memory'];
  heartbeat: string[];
  workspace: Record<string, string>;
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
    'memory.dailySections': dress.memory.dailySections.join(', '),
    'memory.reads': dress.memory.reads.join(', '),
    'workspace.root': `~/.openclaw/workspace/${dress.id}`,
  };
  for (const wsPath of Object.keys(dress.workspace)) {
    vars[`workspace.${wsPath}`] = `~/.openclaw/workspace/${wsPath}`;
  }
  return vars;
}

function isAutoVar(name: string): boolean {
  const autoVarNames = new Set([
    'dress.id',
    'dress.name',
    'memory.dailySections',
    'memory.reads',
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

  // Every cron.skill must reference a key in skills
  for (const cron of dress.crons) {
    if (!dress.skills[cron.skill]) {
      errors.push(`Cron "${cron.id}" references skill "${cron.skill}" which is not in skills`);
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

  return { errors, warnings };
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

  // Compile crons
  const compiledCrons: CompiledCron[] = dress.crons.map((cron) => {
    const schedule = cronSchedules[cron.id];
    if (!schedule) {
      throw new Error(`No schedule provided for cron "${cron.id}"`);
    }
    return {
      id: cron.id,
      dressId: dress.id,
      name: cron.name,
      schedule: cronFromTime(schedule.time, schedule.days, timezone),
      skill: cron.skill,
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
    plugins: dress.requires.plugins,
    lingerie: dress.requires.lingerie,

    memory: dress.memory,
    heartbeat: dress.heartbeat,
    workspace: dress.workspace,
    secrets: dress.secrets,
  };
}
