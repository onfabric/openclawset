#!/usr/bin/env bun
/**
 * Validates dresses, lingerie, and personalities in registry/, then generates registry.json.
 *
 * Validation:
 *  - dress.json / lingerie.json parse against Zod schemas
 *  - param defaults match their declared type (enforced by schema)
 *  - every cron.skill references a key in skills
 *  - every cron.channel is in requires.lingerie
 *  - every bundled skill has a .md file
 *  - every {{placeholder}} in a bundled .md has a matching param or is an auto-var (error)
 *  - every declared param appears as {{param}} in the .md (warning)
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryIndex } from '@repo/cli/core';
import {
  type DressJson,
  dressJsonSchema,
  lingerieJsonSchema,
  personalityJsonSchema,
} from '@repo/cli/core';

const ROOT_DIR = join(import.meta.dir, '../..');

const REGISTRY_DIR = join(ROOT_DIR, 'registry');
const DRESSES_DIR = join(REGISTRY_DIR, 'dresses');
const LINGERIE_DIR = join(REGISTRY_DIR, 'lingerie');
const PERSONALITIES_DIR = join(REGISTRY_DIR, 'personalities');

// Auto-vars injected by the CLI — not declared as params
const AUTO_VARS = new Set([
  'dress.id',
  'dress.name',
  'memory.dailySections',
  'memory.reads',
  'workspace.root',
]);
const AUTO_VAR_PREFIXES = ['workspace.'];

function isAutoVar(name: string): boolean {
  if (AUTO_VARS.has(name)) return true;
  return AUTO_VAR_PREFIXES.some((p) => name.startsWith(p));
}

function extractPlaceholders(content: string): Set<string> {
  const matches = content.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return new Set();
  return new Set(matches.map((m) => m.slice(2, -2).trim()));
}

let errors = 0;
let warnings = 0;

function error(msg: string): void {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function warn(msg: string): void {
  console.warn(`  ⚠ ${msg}`);
  warnings++;
}

// ---------------------------------------------------------------------------
// Validate dresses
// ---------------------------------------------------------------------------

const dressIndex: RegistryIndex['dresses'] = {};

const dressDirs = existsSync(DRESSES_DIR) ? readdirSync(DRESSES_DIR) : [];
for (const dir of dressDirs) {
  const dressPath = join(DRESSES_DIR, dir, 'dress.json');
  if (!existsSync(dressPath)) continue;

  console.log(`dress: ${dir}`);

  let dress: DressJson;
  try {
    const raw = JSON.parse(readFileSync(dressPath, 'utf-8'));
    const result = dressJsonSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        error(`${issue.path.join('.')}: ${issue.message}`);
      }
      continue;
    }
    dress = result.data;
  } catch (e) {
    error(`Failed to parse dress.json: ${e}`);
    continue;
  }

  if (dress.id !== dir) {
    error(`dress.id "${dress.id}" does not match directory name "${dir}"`);
  }

  // Validate cron → skill references
  for (const cron of dress.crons) {
    if (!dress.skills[cron.skill]) {
      error(`cron "${cron.id}" references skill "${cron.skill}" which is not in skills`);
    }
    if (
      cron.channel &&
      cron.channel !== 'last' &&
      !dress.requires.lingerie.includes(cron.channel)
    ) {
      error(`cron "${cron.id}" uses channel "${cron.channel}" not in requires.lingerie`);
    }
  }

  // Validate skills
  for (const [skillId, skillDef] of Object.entries(dress.skills)) {
    if (skillDef.source === 'clawhub') continue;

    // Check .md file exists
    const mdPath = join(DRESSES_DIR, dir, 'skills', `${skillId}.md`);
    if (!existsSync(mdPath)) {
      error(`bundled skill "${skillId}" has no .md file at skills/${skillId}.md`);
      continue;
    }

    // Validate placeholder ↔ param sync
    const content = readFileSync(mdPath, 'utf-8');
    const placeholders = extractPlaceholders(content);
    const declaredParams = new Set(Object.keys(skillDef.params));

    for (const placeholder of placeholders) {
      if (!declaredParams.has(placeholder) && !isAutoVar(placeholder)) {
        error(`skill "${skillId}": {{${placeholder}}} has no matching param or auto-var`);
      }
    }

    for (const param of declaredParams) {
      if (!placeholders.has(param)) {
        warn(`skill "${skillId}": param "${param}" is declared but never used as {{${param}}}`);
      }
    }
  }

  dressIndex[dress.id] = {
    name: dress.name,
    version: dress.version,
    description: dress.description,
    requires: { lingerie: dress.requires.lingerie },
    path: `dresses/${dir}`,
  };
}

// ---------------------------------------------------------------------------
// Validate lingerie
// ---------------------------------------------------------------------------

const lingerieIndex: RegistryIndex['lingerie'] = {};

const uwDirs = existsSync(LINGERIE_DIR) ? readdirSync(LINGERIE_DIR) : [];
for (const dir of uwDirs) {
  const uwPath = join(LINGERIE_DIR, dir, 'lingerie.json');
  if (!existsSync(uwPath)) continue;

  console.log(`lingerie: ${dir}`);

  try {
    const raw = JSON.parse(readFileSync(uwPath, 'utf-8'));
    const result = lingerieJsonSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        error(`${issue.path.join('.')}: ${issue.message}`);
      }
      continue;
    }
    const uw = result.data;

    if (uw.id !== dir) {
      error(`lingerie.id "${uw.id}" does not match directory name "${dir}"`);
    }

    lingerieIndex[uw.id] = {
      name: uw.name,
      version: uw.version,
      description: uw.description,
      path: `lingerie/${dir}`,
    };
  } catch (e) {
    error(`Failed to parse lingerie.json: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Validate personalities
// ---------------------------------------------------------------------------

const personalityIndex: RegistryIndex['personalities'] = {};

const personalityDirs = existsSync(PERSONALITIES_DIR) ? readdirSync(PERSONALITIES_DIR) : [];
for (const dir of personalityDirs) {
  const pPath = join(PERSONALITIES_DIR, dir, 'personality.json');
  if (!existsSync(pPath)) continue;

  console.log(`personality: ${dir}`);

  try {
    const raw = JSON.parse(readFileSync(pPath, 'utf-8'));
    const result = personalityJsonSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        error(`${issue.path.join('.')}: ${issue.message}`);
      }
      continue;
    }
    const p = result.data;

    if (p.id !== dir) {
      error(`personality.id "${p.id}" does not match directory name "${dir}"`);
    }

    personalityIndex[p.id] = {
      name: p.name,
      version: p.version,
      description: p.description,
      path: `personalities/${dir}`,
    };
  } catch (e) {
    error(`Failed to parse personality.json: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Cross-validate: dress lingerie refs exist in registry
// ---------------------------------------------------------------------------

for (const [dressId, entry] of Object.entries(dressIndex)) {
  for (const uwId of entry.requires.lingerie) {
    if (!lingerieIndex[uwId]) {
      error(`dress "${dressId}" requires lingerie "${uwId}" which is not in the registry`);
    }
  }
}

// ---------------------------------------------------------------------------
// Generate registry.json
// ---------------------------------------------------------------------------

if (errors > 0) {
  console.error(`\n${errors} error(s), ${warnings} warning(s). Registry not generated.`);
  process.exit(1);
}

const registry: RegistryIndex = {
  version: 1,
  generatedAt: new Date().toISOString(),
  dresses: dressIndex,
  lingerie: lingerieIndex,
  personalities: personalityIndex,
};

const outPath = join(REGISTRY_DIR, 'registry.json');
writeFileSync(outPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(
  `\n✓ registry.json generated (${Object.keys(dressIndex).length} dresses, ${Object.keys(lingerieIndex).length} lingerie, ${Object.keys(personalityIndex).length} personalities)`,
);
if (warnings > 0) {
  console.warn(`  ${warnings} warning(s)`);
}
