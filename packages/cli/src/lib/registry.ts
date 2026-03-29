import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type DressJson,
  dressJsonSchema,
  type LingerieJson,
  lingerieJsonSchema,
  PERSONALITY_FILES,
  type PersonalityFile,
  personalityJsonSchema,
  type RegistryIndex,
  type ResolvedPersonality,
  registryIndexSchema,
} from '#core/index.ts';

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

  /** Fetch a personality definition by ID, with file contents resolved. */
  getPersonality(personalityId: string): Promise<ResolvedPersonality>;
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

  async getPersonality(personalityId: string): Promise<ResolvedPersonality> {
    const dir = join(this.registryDir, 'personalities', personalityId);
    const raw = JSON.parse(await readFile(join(dir, 'personality.json'), 'utf-8'));
    const manifest = personalityJsonSchema.parse(raw);

    const files = {} as Record<PersonalityFile, string>;
    for (const file of PERSONALITY_FILES) {
      files[file] = await readFile(join(dir, file), 'utf-8');
    }

    return { ...manifest, files };
  }
}

// ---------------------------------------------------------------------------
// GitHubRegistryProvider — fetches from a public GitHub repo
// ---------------------------------------------------------------------------

const DEFAULT_OWNER = 'onfabric';
const DEFAULT_REPO = 'clawtique';
const DEFAULT_BRANCH = 'main';
const DEFAULT_REGISTRY_PATH = 'registry';

/** Cache TTL: 10 minutes */
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface GitHubRegistryOptions {
  owner?: string;
  repo?: string;
  branch?: string;
  registryPath?: string;
  cacheDir?: string;
}

export class GitHubRegistryProvider implements RegistryProvider {
  private baseUrl: string;
  private cacheDir: string | undefined;

  constructor(opts: GitHubRegistryOptions = {}) {
    const owner = opts.owner ?? DEFAULT_OWNER;
    const repo = opts.repo ?? DEFAULT_REPO;
    const branch = opts.branch ?? DEFAULT_BRANCH;
    const regPath = opts.registryPath ?? DEFAULT_REGISTRY_PATH;
    this.baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${regPath}`;
    this.cacheDir = opts.cacheDir;
  }

  async getIndex(): Promise<RegistryIndex> {
    const raw = await this.fetchJson(`${this.baseUrl}/registry.json`, 'registry.json');
    return registryIndexSchema.parse(raw);
  }

  async getDressJson(dressId: string): Promise<DressJson> {
    const raw = await this.fetchJson(
      `${this.baseUrl}/dresses/${dressId}/dress.json`,
      `dresses/${dressId}/dress.json`,
    );
    return dressJsonSchema.parse(raw);
  }

  async getSkillContent(dressId: string, skillName: string): Promise<string> {
    return this.fetchText(
      `${this.baseUrl}/dresses/${dressId}/skills/${skillName}.md`,
      `dresses/${dressId}/skills/${skillName}.md`,
    );
  }

  async getLingerieJson(lingerieId: string): Promise<LingerieJson> {
    const raw = await this.fetchJson(
      `${this.baseUrl}/lingerie/${lingerieId}/lingerie.json`,
      `lingerie/${lingerieId}/lingerie.json`,
    );
    return lingerieJsonSchema.parse(raw);
  }

  async listSkills(dressId: string): Promise<string[]> {
    // GitHub raw doesn't support directory listing.
    // Derive skill names from the dress.json skills field instead.
    const dress = await this.getDressJson(dressId);
    return Object.keys(dress.skills ?? {});
  }

  async getPersonality(personalityId: string): Promise<ResolvedPersonality> {
    const base = `personalities/${personalityId}`;
    const raw = await this.fetchJson(
      `${this.baseUrl}/${base}/personality.json`,
      `${base}/personality.json`,
    );
    const manifest = personalityJsonSchema.parse(raw);

    const files = {} as Record<PersonalityFile, string>;
    for (const file of PERSONALITY_FILES) {
      files[file] = await this.fetchText(`${this.baseUrl}/${base}/${file}`, `${base}/${file}`);
    }

    return { ...manifest, files };
  }

  // ---- internal helpers ----------------------------------------------------

  private async fetchText(url: string, cacheKey: string): Promise<string> {
    const cached = await this.readCache(cacheKey);
    if (cached !== undefined) return cached;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    await this.writeCache(cacheKey, text);
    return text;
  }

  private async fetchJson(url: string, cacheKey: string): Promise<unknown> {
    const text = await this.fetchText(url, cacheKey);
    return JSON.parse(text);
  }

  private async readCache(key: string): Promise<string | undefined> {
    if (!this.cacheDir) return undefined;
    const path = join(this.cacheDir, key);
    if (!existsSync(path)) return undefined;
    try {
      const { mtimeMs } = statSync(path);
      if (Date.now() - mtimeMs > CACHE_TTL_MS) return undefined;
      return await readFile(path, 'utf-8');
    } catch {
      return undefined;
    }
  }

  private async writeCache(key: string, content: string): Promise<void> {
    if (!this.cacheDir) return;
    const path = join(this.cacheDir, key);
    const dir = join(path, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(path, content, 'utf-8');
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
  const candidate = join(cwd, 'registry');
  if (existsSync(join(candidate, 'registry.json'))) {
    return candidate;
  }
  return undefined;
}

/**
 * Create the appropriate RegistryProvider based on environment.
 * Uses local registry/ if present, otherwise falls back to GitHub.
 */
export function createRegistryProvider(cwd: string, cacheDir?: string): RegistryProvider {
  const localDir = detectLocalRegistry(cwd);
  if (localDir) {
    return new LocalRegistryProvider(localDir);
  }
  return new GitHubRegistryProvider({ cacheDir });
}
