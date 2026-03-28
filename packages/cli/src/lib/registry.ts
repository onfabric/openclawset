import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type DressJson,
  dressJsonSchema,
  type LingerieJson,
  lingerieJsonSchema,
  type RegistryIndex,
  registryIndexSchema,
} from '@clawtique/core';

// ---------------------------------------------------------------------------
// RegistryProvider interface
// ---------------------------------------------------------------------------

export interface RegistryProvider {
  /** Fetch the registry index (list of available dresses + lingerie). */
  getIndex(): Promise<RegistryIndex>;

  /** Fetch a dress definition by ID. */
  getDressJson(dressId: string): Promise<DressJson>;

  /** Read a bundled skill .md file for a dress. */
  getSkillContent(dressId: string, skillName: string): Promise<string>;

  /** Fetch an lingerie definition by ID. */
  getLingerieJson(lingerieId: string): Promise<LingerieJson>;

  /** List all available skill .md files for a dress. */
  listSkills(dressId: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// LocalRegistryProvider — reads from registry/ on disk
// ---------------------------------------------------------------------------

export class LocalRegistryProvider implements RegistryProvider {
  constructor(private registryDir: string) {}

  async getIndex(): Promise<RegistryIndex> {
    const indexPath = join(this.registryDir, 'registry.json');
    const raw = JSON.parse(await readFile(indexPath, 'utf-8'));
    return registryIndexSchema.parse(raw);
  }

  async getDressJson(dressId: string): Promise<DressJson> {
    const dressPath = join(this.registryDir, 'dresses', dressId, 'dress.json');
    const raw = JSON.parse(await readFile(dressPath, 'utf-8'));
    return dressJsonSchema.parse(raw);
  }

  async getSkillContent(dressId: string, skillName: string): Promise<string> {
    const skillPath = join(this.registryDir, 'dresses', dressId, 'skills', `${skillName}.md`);
    return readFile(skillPath, 'utf-8');
  }

  async getLingerieJson(lingerieId: string): Promise<LingerieJson> {
    const uwPath = join(this.registryDir, 'lingerie', lingerieId, 'lingerie.json');
    const raw = JSON.parse(await readFile(uwPath, 'utf-8'));
    return lingerieJsonSchema.parse(raw);
  }

  async listSkills(dressId: string): Promise<string[]> {
    const skillsDir = join(this.registryDir, 'dresses', dressId, 'skills');
    if (!existsSync(skillsDir)) return [];
    const files = await readdir(skillsDir);
    return files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  }
}

// ---------------------------------------------------------------------------
// Detection: find the registry directory
// ---------------------------------------------------------------------------

/**
 * Detect whether a local registry/ directory exists.
 * Checks CWD first, then walks up looking for a registry/ with registry.json.
 */
export function detectLocalRegistry(cwd: string): string | undefined {
  // Check CWD/registry
  const candidate = join(cwd, 'registry');
  if (existsSync(join(candidate, 'registry.json'))) {
    return candidate;
  }
  return undefined;
}

/**
 * Create the appropriate RegistryProvider based on environment.
 * For now, only local is supported. Remote will be added later.
 */
export function createRegistryProvider(cwd: string): RegistryProvider {
  const localDir = detectLocalRegistry(cwd);
  if (localDir) {
    return new LocalRegistryProvider(localDir);
  }
  // TODO: return GitHubRegistryProvider when remote support is added
  throw new Error(
    'No local registry found. Remote registry support is not yet available.\n' +
      'Run this command from the clawtique repository root, or install dresses from a local registry.',
  );
}
